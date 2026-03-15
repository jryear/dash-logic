// Traces to: ARCHITECTURE-dash.md §3.1, §6.3, §7.2 Stages 5-6, §7.3, §7.4; README.md D-001, D-002

import { randomUUID } from "node:crypto";

import { createAdminSupabaseClient, createDashPrivateSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  LedgerWrittenEventSchema,
  type ArtifactCommitmentsExtractedEvent,
  type CommitmentProposal,
  type LedgerWrittenEvent,
} from "@/pipeline/types";
import {
  asQueryClient,
  buildIdempotencyKey,
  buildProvenance,
  completeProcessingJob,
  failProcessingJob,
  findExistingCompletedJob,
  stableStringify,
  startProcessingJob,
} from "@/pipeline/utils";

const SCORE_AND_EMIT_VERSION = "1.1.0";

const REQUIRED_COMMITMENT_FIELDS: Record<string, string[]> = {
  created: ["schema_version", "sku", "partner_id", "description"],
  term_set: ["schema_version", "term_type", "value", "unit"],
  quantity_committed: ["schema_version", "quantity", "unit", "sku", "unit_price", "currency", "due_date"],
  milestone_set: ["schema_version", "milestone_type", "date", "description"],
  status_updated: ["schema_version", "from_status", "to_status", "reason"],
  amended: ["schema_version", "field", "old_value", "new_value", "reason"],
  cancelled: ["schema_version", "reason", "cancellation_terms"],
  invoice_issued: ["schema_version", "invoice_number", "amount", "currency", "due_date", "line_items", "terms"],
  payment_made: ["schema_version", "amount", "currency", "method", "reference_id"],
};

const REQUIRED_FULFILLMENT_FIELDS: Record<string, string[]> = {
  shipped: ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
  received: ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
  delivered: ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
  partial_received: ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
  returned: ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
};

type LedgerRecord = {
  event_id: number;
  commitment_id: string;
  seq: number;
  event_type: string;
  event_time: string;
  event_time_source?: string;
  event_time_confidence?: string;
  event_time_reason?: string | null;
  event_time_provenance?: Record<string, unknown>;
  relationship_id?: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
};

type CandidateStoragePayload = {
  proposals: CommitmentProposal[];
  schema_version: "v1";
};

function requiredFieldsForProposal(proposal: CommitmentProposal) {
  return proposal.target_table === "commitment_events"
    ? REQUIRED_COMMITMENT_FIELDS[proposal.event_type] ?? []
    : REQUIRED_FULFILLMENT_FIELDS[proposal.event_type] ?? [];
}

function payloadHasRequiredFields(proposal: CommitmentProposal) {
  const payload = proposal.payload as Record<string, unknown>;
  return requiredFieldsForProposal(proposal).every((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function countEvidenceCoverage(proposal: CommitmentProposal) {
  return proposal.evidence_span_ids.length;
}

function isPlaceholderEventTime(input: string) {
  const normalized = new Date(input).toISOString();
  return new Set([
    "1970-01-01T00:00:00.000Z",
    "2000-01-01T00:00:00.000Z",
    "2024-01-01T00:00:00.000Z",
  ]).has(normalized);
}

function hasEventTimeIntegrity(proposal: CommitmentProposal) {
  if (Number.isNaN(Date.parse(proposal.event_time)) || isPlaceholderEventTime(proposal.event_time)) {
    return false;
  }

  if (
    proposal.event_time_source === "inferred_fallback" &&
    (!proposal.event_time_reason || Object.keys(proposal.event_time_provenance ?? {}).length === 0)
  ) {
    return false;
  }

  return true;
}

function hasLegacyFulfillmentQuantityField(proposal: CommitmentProposal) {
  return (
    proposal.target_table === "fulfillment_events" &&
    Object.prototype.hasOwnProperty.call(proposal.payload, "quantity_received")
  );
}

function isInferenceProposal(proposal: CommitmentProposal) {
  const signal = `${proposal.reasoning} ${proposal.event_type}`.toLowerCase();
  return (
    signal.includes("soft") ||
    signal.includes("likely") ||
    signal.includes("estimated") ||
    signal.includes("inference") ||
    proposal.confidence < 0.9
  );
}

function resolveConflictAdjustment(proposal: CommitmentProposal, existingRows: LedgerRecord[]) {
  const latestSameType = existingRows.find((row) => row.event_type === proposal.event_type);

  if (!latestSameType) {
    return { resolution: "additive", adjustedConfidence: proposal.confidence };
  }

  const currentPayload = latestSameType.payload ?? {};
  const nextPayload = proposal.payload as Record<string, unknown>;

  if (proposal.event_type === "milestone_set" && currentPayload.milestone_type === nextPayload.milestone_type) {
    if (currentPayload.date !== nextPayload.date) {
      return { resolution: "supersedes", adjustedConfidence: proposal.confidence };
    }
  }

  if (proposal.event_type === "term_set" && currentPayload.term_type === nextPayload.term_type) {
    if (stableStringify(currentPayload) !== stableStringify(nextPayload)) {
      return { resolution: "supersedes", adjustedConfidence: proposal.confidence };
    }
  }

  if (proposal.event_type === "quantity_committed") {
    if (
      currentPayload.quantity !== nextPayload.quantity ||
      currentPayload.unit_price !== nextPayload.unit_price ||
      currentPayload.due_date !== nextPayload.due_date
    ) {
      return { resolution: "conflicts", adjustedConfidence: Math.min(proposal.confidence, 0.79) };
    }
  }

  return { resolution: "additive", adjustedConfidence: proposal.confidence };
}

async function inferCommitmentId(
  dashPrivateClient: ReturnType<typeof asQueryClient>,
  proposal: CommitmentProposal,
) {
  const skuValue = typeof proposal.payload.sku === "string" ? proposal.payload.sku : null;

  if (!skuValue) {
    return null;
  }

  const { data } = await dashPrivateClient
    .from("commitment_events")
    .select("commitment_id,relationship_id,payload")
    .eq("relationship_id", proposal.relationship_id)
    .order("seq", { ascending: false });

  const matches = ((data ?? []) as LedgerRecord[]).filter((row) => row.payload?.sku === skuValue);
  const uniqueCommitmentIds = [...new Set(matches.map((row) => row.commitment_id))];

  return uniqueCommitmentIds.length === 1 ? uniqueCommitmentIds[0] : null;
}

async function fetchExistingRows(
  dashPrivateClient: ReturnType<typeof asQueryClient>,
  proposal: CommitmentProposal,
  commitmentId: string,
) {
  const table = proposal.target_table;
  const { data, error } = await dashPrivateClient
    .from(table)
    .select("event_id,commitment_id,seq,event_type,event_time,relationship_id,payload,idempotency_key")
    .eq("commitment_id", commitmentId)
    .order("seq", { ascending: false });

  if (error) {
    throw new Error(`Failed loading ${table} stream for ${commitmentId}: ${error.message}`);
  }

  return ((data ?? []) as LedgerRecord[]);
}

async function insertLedgerRow(
  dashPrivateClient: ReturnType<typeof asQueryClient>,
  proposal: CommitmentProposal,
  commitmentId: string,
  seq: number,
  extractor: ReturnType<typeof buildProvenance>,
  confidence: number,
  idempotencyKey: string,
) {
  const table = proposal.target_table;
  const baseRow = {
    commitment_id: commitmentId,
    seq,
    event_type: proposal.event_type,
    event_time: proposal.event_time,
    event_time_source: proposal.event_time_source,
    event_time_confidence: proposal.event_time_confidence,
    event_time_reason: proposal.event_time_reason,
    event_time_provenance: proposal.event_time_provenance as Json,
    payload: proposal.payload as Json,
    evidence_span_ids: proposal.evidence_span_ids,
    extractor: extractor as unknown as Json,
    confidence,
    idempotency_key: idempotencyKey,
  };

  const row =
    table === "commitment_events"
      ? {
          ...baseRow,
          relationship_id: proposal.relationship_id,
          epistemic_class: isInferenceProposal(proposal) ? "INFERENCE" : "FACT_CANDIDATE",
        }
      : baseRow;

  const { data, error } = await dashPrivateClient
    .from(table)
    .insert(row)
    .select("event_id,commitment_id,idempotency_key")
    .single();

  if (!error && data) {
    return data as { event_id: number; commitment_id: string; idempotency_key: string };
  }

  if (error?.code === "23505") {
    const { data: existing } = await dashPrivateClient
      .from(table)
      .select("event_id,commitment_id,idempotency_key")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      return existing as { event_id: number; commitment_id: string; idempotency_key: string };
    }
  }

  throw new Error(`Failed writing ${table} row: ${error?.message ?? "unknown"}`);
}

async function storeCandidateOnly(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  artifactId: number,
  extractor: ReturnType<typeof buildProvenance>,
  proposals: CommitmentProposal[],
) {
  if (proposals.length === 0) {
    return;
  }

  const idempotencyKey = buildIdempotencyKey(artifactId, `${extractor.version}:candidate_stored`, proposals);
  const existing = await findExistingCompletedJob<CandidateStoragePayload>(
    supabase,
    artifactId,
    "candidate_stored",
    idempotencyKey,
  );

  if (existing) {
    return;
  }

  const jobId = await startProcessingJob(supabase, artifactId, "candidate_stored", idempotencyKey, extractor);
  await completeProcessingJob(supabase, jobId, {
    artifactId,
    idempotencyKey,
    extractor,
    output: {
      proposals,
      schema_version: "v1",
    },
  });
}

export interface ScoreAndEmitStageResult {
  skipped: boolean;
  idempotencyKey: string;
  extractor: ReturnType<typeof buildProvenance>;
  written: LedgerWrittenEvent;
  candidatesStored: number;
}

export async function runScoreAndEmitStage(
  payload: ArtifactCommitmentsExtractedEvent,
): Promise<ScoreAndEmitStageResult> {
  const supabase = createAdminSupabaseClient();
  const dashPrivateSupabase = createDashPrivateSupabaseClient();
  const extractor = buildProvenance({
    name: "score-and-emit-v1",
    version: SCORE_AND_EMIT_VERSION,
    model: "database-driven",
    prompt: "database-driven-score-and-emit",
  });
  const idempotencyKey = buildIdempotencyKey(payload.artifactId, extractor.version, payload.commitments);
  const existing = await findExistingCompletedJob<LedgerWrittenEvent>(
    supabase,
    payload.artifactId,
    "score_and_emit",
    idempotencyKey,
  );

  if (existing) {
    return {
      skipped: true,
      idempotencyKey,
      extractor,
      written: LedgerWrittenEventSchema.parse(existing.payload.output),
      candidatesStored: 0,
    };
  }

  const jobId = await startProcessingJob(supabase, payload.artifactId, "score_and_emit", idempotencyKey, extractor);
  const queryClient = asQueryClient(dashPrivateSupabase as never);

  try {
    const writtenRecords: LedgerWrittenEvent["records"] = [];
    const candidateOnly: CommitmentProposal[] = [];

    for (const proposal of payload.commitments.proposals) {
      if (
        !payloadHasRequiredFields(proposal) ||
        countEvidenceCoverage(proposal) === 0 ||
        !hasEventTimeIntegrity(proposal) ||
        hasLegacyFulfillmentQuantityField(proposal)
      ) {
        candidateOnly.push(proposal);
        continue;
      }

      let commitmentId = proposal.commitment_id;
      if (!commitmentId) {
        commitmentId = (await inferCommitmentId(queryClient, proposal)) ?? randomUUID();
      }

      const existingRows = await fetchExistingRows(queryClient, proposal, commitmentId);
      const nextSeq = (existingRows[0]?.seq ?? 0) + 1;
      const conflictResolution = resolveConflictAdjustment(proposal, existingRows);
      const gatedConfidence = conflictResolution.adjustedConfidence;

      if (gatedConfidence < 0.7) {
        candidateOnly.push(proposal);
        continue;
      }

      const ledgerIdempotencyKey = buildIdempotencyKey(payload.artifactId, extractor.version, proposal.payload);
      let inserted: { event_id: number; commitment_id: string; idempotency_key: string } | null = null;
      let seq = nextSeq;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          inserted = await insertLedgerRow(
            queryClient,
            proposal,
            commitmentId,
            seq,
            extractor,
            gatedConfidence,
            ledgerIdempotencyKey,
          );
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown ledger write error";
          if (!message.includes("duplicate key") && !message.includes("23505")) {
            throw error;
          }

          const refreshedRows = await fetchExistingRows(queryClient, proposal, commitmentId);
          seq = (refreshedRows[0]?.seq ?? seq) + 1;
        }
      }

      if (!inserted) {
        throw new Error(`Failed to write ledger event for ${proposal.event_type}`);
      }

      writtenRecords.push({
        event_id: inserted.event_id,
        target_table: proposal.target_table,
        commitment_id: inserted.commitment_id,
        idempotency_key: inserted.idempotency_key,
      });
    }

    await storeCandidateOnly(supabase, payload.artifactId, extractor, candidateOnly);

    const writtenPayload = LedgerWrittenEventSchema.parse({
      artifactId: payload.artifactId,
      records: writtenRecords,
      schema_version: "v1",
    });

    await completeProcessingJob(supabase, jobId, {
      artifactId: payload.artifactId,
      idempotencyKey,
      extractor,
      output: writtenPayload,
    });

    return {
      skipped: false,
      idempotencyKey,
      extractor,
      written: writtenPayload,
      candidatesStored: candidateOnly.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown score_and_emit error";
    await failProcessingJob(supabase, jobId, {
      artifactId: payload.artifactId,
      idempotencyKey,
      extractor,
      error: message,
    });
    throw error;
  }
}
