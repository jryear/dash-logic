// Traces to: ARCHITECTURE-dash.md §7.1-§7.4, README.md Milestone 3

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";
import type { ExtractorProvenance } from "@/pipeline/types";

export type DashSupabaseClient = SupabaseClient<Database>;

export type PipelineStage =
  | "classify"
  | "extract_entities"
  | "resolve_entities"
  | "extract_commitments"
  | "score_and_emit"
  | "candidate_stored";

export interface ProcessingJobPayload<TOutput> {
  artifactId: number;
  idempotencyKey: string;
  extractor: ExtractorProvenance;
  output: TOutput;
}

interface ArtifactRecord {
  artifact_id: number;
  source_system: string;
  source_locator: string;
  mime_type: string;
  storage_uri: string;
  metadata: Json;
}

interface EvidenceSpanRecord {
  evidence_span_id: number;
  extracted_text: string;
  locator: Json;
}

interface ProcessingJobLookupRecord {
  job_id: number;
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  result: Json | null;
}

export function asQueryClient(supabase: DashSupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => any;
    storage: {
      from: (bucket: string) => {
        download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
      };
    };
  };
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

export function buildIdempotencyKey(
  artifactId: number,
  extractorVersion: string,
  payload: unknown,
) {
  const normalizedPayloadHash = sha256(stableStringify(payload));
  return sha256(`${artifactId}:${extractorVersion}:${normalizedPayloadHash}`);
}

export async function findExistingCompletedJob<TOutput>(
  supabase: DashSupabaseClient,
  artifactId: number,
  stage: PipelineStage,
  idempotencyKey: string,
) {
  const client = asQueryClient(supabase);

  // Primary path: query the indexed idempotency_key column (009_ migration)
  const { data: directMatch, error: directError } = await client
    .from("processing_jobs")
    .select("job_id,status,result")
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "completed")
    .maybeSingle();

  if (directError) {
    throw new Error(`Failed to query processing_jobs for ${stage}: ${directError.message}`);
  }

  if (directMatch) {
    const typedMatch = directMatch as unknown as ProcessingJobLookupRecord;
    const result = typedMatch.result as unknown as ProcessingJobPayload<TOutput>;
    return { jobId: typedMatch.job_id, payload: result };
  }

  return null;
}

export async function startProcessingJob(
  supabase: DashSupabaseClient,
  artifactId: number,
  stage: PipelineStage,
  idempotencyKey: string,
  extractor: ExtractorProvenance,
) {
  const client = asQueryClient(supabase);

  // Clear idempotency_key from any previous failed job so the unique constraint
  // doesn't block retry. Without this, a failed run leaves an idempotency_key
  // that findExistingCompletedJob (status='completed') never sees, but the
  // partial unique index still prevents re-insertion.
  await client
    .from("processing_jobs")
    .update({ idempotency_key: null })
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["failed", "pending"]);

  const { data: inserted, error: insertError } = await client
    .from("processing_jobs")
    .insert({
      artifact_id: artifactId,
      stage,
      status: "pending",
      retry_count: 0,
      idempotency_key: idempotencyKey,
      result: {
        artifactId,
        idempotencyKey,
        extractor,
      } satisfies Json,
    })
    .select("job_id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to create processing_job for ${stage}: ${insertError?.message ?? "unknown"}`);
  }

  const { error: updateError } = await client
    .from("processing_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      result: {
        artifactId,
        idempotencyKey,
        extractor,
      } satisfies Json,
    })
    .eq("job_id", inserted.job_id);

  if (updateError) {
    throw new Error(`Failed to move processing_job ${inserted.job_id} to processing: ${updateError.message}`);
  }

  return inserted.job_id;
}

export async function completeProcessingJob<TOutput>(
  supabase: DashSupabaseClient,
  jobId: number,
  payload: ProcessingJobPayload<TOutput>,
) {
  const client = asQueryClient(supabase);
  const { error } = await client
    .from("processing_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result: payload as unknown as Json,
      error: null,
    })
    .eq("job_id", jobId);

  if (error) {
    throw new Error(`Failed to complete processing_job ${jobId}: ${error.message}`);
  }
}

export async function failProcessingJob(
  supabase: DashSupabaseClient,
  jobId: number,
  payload: {
    artifactId: number;
    idempotencyKey: string;
    extractor: ExtractorProvenance;
    error: string;
  },
) {
  const client = asQueryClient(supabase);
  const { error } = await client
    .from("processing_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: payload.error,
      result: payload as unknown as Json,
    })
    .eq("job_id", jobId);

  if (error) {
    throw new Error(`Failed to fail processing_job ${jobId}: ${error.message}`);
  }
}

function parseStorageUri(storageUri: string) {
  const trimmed = storageUri.replace(/^\/+/, "");

  if (!trimmed.includes("/")) {
    return { bucket: "artifacts", path: trimmed };
  }

  const [first, ...rest] = trimmed.split("/");

  if (first === "artifacts") {
    return { bucket: "artifacts", path: rest.join("/") };
  }

  return { bucket: "artifacts", path: trimmed };
}

export async function loadArtifactText(
  supabase: DashSupabaseClient,
  artifactId: number,
) {
  const client = asQueryClient(supabase);
  const { data: artifact, error: artifactError } = await client
    .from("artifacts")
    .select("artifact_id,source_system,source_locator,mime_type,storage_uri,metadata")
    .eq("artifact_id", artifactId)
    .single();

  const typedArtifact = artifact as unknown as ArtifactRecord | null;

  if (artifactError || !typedArtifact) {
    throw new Error(`Artifact ${artifactId} not found: ${artifactError?.message ?? "unknown"}`);
  }

  const storage = parseStorageUri(typedArtifact.storage_uri);
  let storageText: string | null = null;

  const download = await client.storage.from(storage.bucket).download(storage.path);
  if (!download.error && download.data) {
    storageText = await download.data.text();
  }

  const { data: spans, error: spanError } = await client
    .from("evidence_spans")
    .select("evidence_span_id,extracted_text,locator")
    .eq("artifact_id", artifactId)
    .order("evidence_span_id", { ascending: true });

  if (spanError) {
    throw new Error(`Failed to load evidence spans for artifact ${artifactId}: ${spanError.message}`);
  }

  const typedSpans = ((spans ?? []) as unknown as EvidenceSpanRecord[]);
  const spanText = typedSpans.map((span) => span.extracted_text).join("\n");
  const metadataText = stableStringify(typedArtifact.metadata ?? {});
  const combined = [storageText, spanText, metadataText].filter(Boolean).join("\n\n").trim();

  if (!combined) {
    throw new Error(`Artifact ${artifactId} has no readable text in storage or evidence spans.`);
  }

  return {
    artifact: typedArtifact,
    spans: typedSpans,
    text: combined,
  };
}

export function buildProvenance(input: {
  name: string;
  version: string;
  model: string;
  prompt: string;
}): ExtractorProvenance {
  return {
    name: input.name,
    version: input.version,
    model: input.model,
    prompt_sha256: sha256(input.prompt),
    schema_version: "v1",
  };
}
