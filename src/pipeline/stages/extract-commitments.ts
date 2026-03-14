// Traces to: ARCHITECTURE-dash.md §3.1, §7.2 Stage 4, §7.3, §7.4; README.md D-001, D-002

import { requestStructuredObject } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import { createAdminSupabaseClient, createDashPrivateSupabaseClient } from "@/lib/supabase/admin";
import {
  CommitmentExtractionResultSchema,
  type ArtifactEntitiesResolvedEvent,
  type CommitmentExtractionResult,
  type CommitmentProposal,
} from "@/pipeline/types";
import {
  asQueryClient,
  buildIdempotencyKey,
  buildProvenance,
  completeProcessingJob,
  failProcessingJob,
  findExistingCompletedJob,
  loadArtifactText,
  stableStringify,
  startProcessingJob,
} from "@/pipeline/utils";

const EXTRACT_COMMITMENTS_VERSION = "1.0.0";

const EXTRACT_COMMITMENTS_SYSTEM_PROMPT = `
You convert resolved supplier artifact context into ledger event proposals for Dash.

Dash tracks immutable commitment and fulfillment events.
Use these rules:
- A hard commitment is a concrete promise: "ships Jan 15", "1,200 units at $3.50", "invoice due Feb 28"
- A soft commitment is probabilistic or estimated language: "should arrive by Friday", "likely next week"
- A conditional commitment depends on a gate: "ships once deposit clears"
- A non-commitment is status chatter without a concrete promise: "we're working on it"
- Past-tense shipment or receipt language belongs in fulfillment_events, not commitment_events
- Invoice signals produce commitment_events.invoice_issued
- Payment signals produce commitment_events.payment_made

Return JSON only. No markdown fences.
Only use relationship_id, commitment_id, and evidence_span_ids supplied in the context.
If the artifact does not support a durable ledger event, put it in non_commitments.

Your response must be exactly this shape:
{
  "proposals": [
    {
      "target_table": "commitment_events" or "fulfillment_events",
      "event_type": one of the allowed types below,
      "event_time": ISO 8601 timestamp for when the event occurred or was communicated,
      "commitment_id": existing commitment UUID from context or null for new commitments,
      "relationship_id": UUID from the available active relationships,
      "payload": { "schema_version": "v1", ...event-type-specific fields only },
      "evidence_span_ids": [integer IDs from the available evidence spans],
      "confidence": number 0-1,
      "reasoning": "why this is a commitment/fulfillment event and why this confidence level",
      "schema_version": "v1"
    }
  ],
  "non_commitments": [
    { "text": "the source text", "reasoning": "why this is not a durable event" }
  ],
  "schema_version": "v1"
}

Allowed commitment_events event_types and their required payload fields:
- created: schema_version, sku, partner_id, description
- term_set: schema_version, term_type, value, unit
- quantity_committed: schema_version, quantity, unit, sku, unit_price, currency, due_date
- milestone_set: schema_version, milestone_type, date, description
- status_updated: schema_version, from_status, to_status, reason
- amended: schema_version, field, old_value, new_value, reason
- cancelled: schema_version, reason, cancellation_terms
- invoice_issued: schema_version, invoice_number, amount, currency, due_date, line_items, terms
- payment_made: schema_version, amount, currency, method, reference_id

Allowed fulfillment_events event_types and their required payload fields:
- shipped: schema_version, quantity, sku, tracking_number, carrier, location
- received: schema_version, quantity, sku, tracking_number, carrier, location
- delivered: schema_version, quantity, sku, tracking_number, carrier, location
- partial_received: schema_version, quantity, sku, tracking_number, carrier, location
- returned: schema_version, quantity, sku, tracking_number, carrier, location
`.trim();

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

type RelationshipRecord = {
  relationship_id: string;
  partner_id: string;
  status: string;
};

type SkuRecord = {
  sku_id: string;
  name: string;
  normalized_name: string;
  variants: string[];
};

type CommitmentCandidate = {
  commitment_id: string;
  relationship_id: string;
  event_type: string;
  event_time: string;
  payload: Record<string, unknown>;
};

function requiredFieldsForProposal(proposal: CommitmentProposal) {
  return proposal.target_table === "commitment_events"
    ? REQUIRED_COMMITMENT_FIELDS[proposal.event_type] ?? []
    : REQUIRED_FULFILLMENT_FIELDS[proposal.event_type] ?? [];
}

function hasRequiredPayloadFields(proposal: CommitmentProposal) {
  const payload = proposal.payload as Record<string, unknown>;
  return requiredFieldsForProposal(proposal).every((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function isValidEventTime(input: string) {
  return !Number.isNaN(Date.parse(input));
}

function sanitizeProposals(
  raw: CommitmentExtractionResult,
  validEvidenceIds: Set<number>,
  validRelationshipIds: Set<string>,
  validCommitmentIds: Set<string>,
) {
  const proposals: CommitmentProposal[] = [];
  const nonCommitments = [...raw.non_commitments];

  for (const proposal of raw.proposals) {
    const badEvidence = proposal.evidence_span_ids.some((id) => !validEvidenceIds.has(id));
    const badRelationship = !validRelationshipIds.has(proposal.relationship_id);
    const badCommitment =
      proposal.commitment_id !== null && !validCommitmentIds.has(proposal.commitment_id);

    if (!isValidEventTime(proposal.event_time) || badEvidence || badRelationship || badCommitment || !hasRequiredPayloadFields(proposal)) {
      nonCommitments.push({
        text: stableStringify(proposal),
        reasoning: [
          !isValidEventTime(proposal.event_time) ? "Invalid event_time." : null,
          badEvidence ? "Proposal referenced evidence_span_ids outside the artifact context." : null,
          badRelationship ? "Proposal referenced an unknown relationship_id." : null,
          badCommitment ? "Proposal referenced an unknown commitment_id." : null,
          !hasRequiredPayloadFields(proposal) ? "Proposal payload missed required D-002 fields." : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
      continue;
    }

    proposals.push(proposal);
  }

  return {
    proposals,
    non_commitments: nonCommitments,
    schema_version: "v1" as const,
  };
}

export interface CommitmentExtractionStageResult {
  skipped: boolean;
  idempotencyKey: string;
  extractor: ReturnType<typeof buildProvenance>;
  output: CommitmentExtractionResult;
}

export async function runCommitmentExtractionStage(
  payload: ArtifactEntitiesResolvedEvent,
): Promise<CommitmentExtractionStageResult> {
  const supabase = createAdminSupabaseClient();
  const privateSupabase = createDashPrivateSupabaseClient();
  const artifactContext = await loadArtifactText(supabase, payload.artifactId);
  const extractor = buildProvenance({
    name: "extract-commitments-v1",
    version: EXTRACT_COMMITMENTS_VERSION,
    model: MODEL_ROUTING.extract_commitments,
    prompt: EXTRACT_COMMITMENTS_SYSTEM_PROMPT,
  });
  const idempotencyKey = buildIdempotencyKey(payload.artifactId, extractor.version, {
    classification: payload.classification,
    extraction: payload.extraction,
    resolution: payload.resolution,
    artifactText: artifactContext.text,
  });
  const existing = await findExistingCompletedJob<CommitmentExtractionResult>(
    supabase,
    payload.artifactId,
    "extract_commitments",
    idempotencyKey,
  );

  if (existing) {
    return {
      skipped: true,
      idempotencyKey,
      extractor,
      output: CommitmentExtractionResultSchema.parse(existing.payload.output),
    };
  }

  const matchedPartnerIds = payload.resolution.partners
    .map((partner) => partner.matched_partner_id)
    .filter((value): value is string => Boolean(value));
  const matchedSkuIds = payload.resolution.skus
    .map((sku) => sku.matched_sku_id)
    .filter((value): value is string => Boolean(value));

  const queryClient = asQueryClient(supabase);
  const privateClient = asQueryClient(privateSupabase as never);
  const relationshipRows = matchedPartnerIds.length
    ? ((await queryClient
        .from("relationships")
        .select("relationship_id,partner_id,status")
        .in("partner_id", matchedPartnerIds)
        .eq("status", "active")).data as RelationshipRecord[] | null) ?? []
    : [];
  const skuRows = matchedSkuIds.length
    ? ((await queryClient
        .from("skus")
        .select("sku_id,name,normalized_name,variants")
        .in("sku_id", matchedSkuIds)).data as SkuRecord[] | null) ?? []
    : [];

  const relationshipIds = relationshipRows.map((row) => row.relationship_id);
  const skuNames = new Set(
    skuRows.flatMap((row) => [row.name, row.normalized_name, ...(row.variants ?? [])].filter(Boolean)),
  );
  const commitmentRows = relationshipIds.length
    ? ((await privateClient
        .from("commitment_events")
        .select("commitment_id,relationship_id,event_type,event_time,payload,seq")
        .in("relationship_id", relationshipIds)
        .order("seq", { ascending: false })).data as CommitmentCandidate[] | null) ?? []
    : [];

  const commitmentCandidates = commitmentRows.filter((row) => {
    const skuValue = typeof row.payload?.sku === "string" ? row.payload.sku : null;
    return skuNames.size === 0 || (skuValue !== null && skuNames.has(skuValue));
  });

  const validEvidenceIds = new Set(artifactContext.spans.map((span) => span.evidence_span_id));
  const validRelationshipIds = new Set(relationshipRows.map((row) => row.relationship_id));
  const validCommitmentIds = new Set(commitmentCandidates.map((row) => row.commitment_id));

  const jobId = await startProcessingJob(
    supabase,
    payload.artifactId,
    "extract_commitments",
    idempotencyKey,
    extractor,
  );

  try {
    const rawResult = CommitmentExtractionResultSchema.parse(
      await requestStructuredObject<CommitmentExtractionResult>({
        model: MODEL_ROUTING.extract_commitments,
        system: EXTRACT_COMMITMENTS_SYSTEM_PROMPT,
        maxTokens: 3200,
        prompt: `
Artifact ID: ${payload.artifactId}
Document type: ${payload.classification.document_type}
Classification reasoning: ${payload.classification.reasoning}

Resolved partners:
${stableStringify(payload.resolution.partners)}

Resolved contacts:
${stableStringify(payload.resolution.contacts)}

Resolved skus:
${stableStringify(payload.resolution.skus)}

Available active relationships:
${stableStringify(relationshipRows)}

Existing commitment candidates:
${stableStringify(commitmentCandidates)}

Available evidence spans for this artifact:
${stableStringify(artifactContext.spans.map((span) => ({
          evidence_span_id: span.evidence_span_id,
          text: span.extracted_text,
          locator: span.locator,
        })))}

Artifact text:
${artifactContext.text}
        `.trim(),
      }),
    );

    const sanitized = CommitmentExtractionResultSchema.parse(
      sanitizeProposals(rawResult, validEvidenceIds, validRelationshipIds, validCommitmentIds),
    );

    await completeProcessingJob(supabase, jobId, {
      artifactId: payload.artifactId,
      idempotencyKey,
      extractor,
      output: sanitized,
    });

    return {
      skipped: false,
      idempotencyKey,
      extractor,
      output: sanitized,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extract_commitments error";
    await failProcessingJob(supabase, jobId, {
      artifactId: payload.artifactId,
      idempotencyKey,
      extractor,
      error: message,
    });
    throw error;
  }
}
