// Traces to: ARCHITECTURE-dash.md §7.2 Stage 1, README.md Milestone 3

import { requestStructuredObject } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ClassificationResultSchema, type ClassificationResult } from "@/pipeline/types";
import {
  buildIdempotencyKey,
  buildProvenance,
  completeProcessingJob,
  failProcessingJob,
  findExistingCompletedJob,
  loadArtifactText,
  startProcessingJob,
} from "@/pipeline/utils";

const CLASSIFIER_VERSION = "1.0.0";

const CLASSIFICATION_SYSTEM_PROMPT = `
You classify supplier-side operational artifacts for Dash.

Dash tracks promises, quantities, dates, invoices, and fulfillment activity across supplier relationships.
Choose exactly one document type:
- purchase_order: a document where one party commits to buying specific quantities at specific prices
- invoice: a bill or payment request tied to goods or services
- shipping_notification: a notice that goods have shipped, are in transit, or include carrier/tracking details
- status_update: an operational update with concrete progress, delays, milestone shifts, or production status
- check_in: conversational outreach with no concrete quantity, commitment, or date
- terms_agreement: terms, payment conditions, MOQs, lead times, or contractual operating constraints
- negotiation: pricing discussions, counter-offers, MOQ haggling, discount requests, or any back-and-forth on deal terms
- noise: spam, newsletters, signatures-only, or content unrelated to supplier operations

Return JSON only. No markdown. Use schema_version "v1".
`.trim();

export interface ClassificationStageResult {
  skipped: boolean;
  idempotencyKey: string;
  extractor: ReturnType<typeof buildProvenance>;
  output: ClassificationResult;
}

export async function runClassificationStage(artifactId: number): Promise<ClassificationStageResult> {
  const supabase = createAdminSupabaseClient();
  const artifactContext = await loadArtifactText(supabase, artifactId);
  const extractor = buildProvenance({
    name: "classify-v1",
    version: CLASSIFIER_VERSION,
    model: MODEL_ROUTING.classify,
    prompt: CLASSIFICATION_SYSTEM_PROMPT,
  });
  const idempotencyKey = buildIdempotencyKey(artifactId, extractor.version, artifactContext.text);
  const existing = await findExistingCompletedJob<ClassificationResult>(
    supabase,
    artifactId,
    "classify",
    idempotencyKey,
  );

  if (existing) {
    return {
      skipped: true,
      idempotencyKey,
      extractor,
      output: ClassificationResultSchema.parse(existing.payload.output),
    };
  }

  const jobId = await startProcessingJob(supabase, artifactId, "classify", idempotencyKey, extractor);

  try {
    const result = ClassificationResultSchema.parse(
      await requestStructuredObject<ClassificationResult>({
        model: MODEL_ROUTING.classify,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        prompt: `
Artifact ID: ${artifactId}
Source system: ${artifactContext.artifact.source_system}
MIME type: ${artifactContext.artifact.mime_type}
Text:
${artifactContext.text}
        `.trim(),
      }),
    );

    await completeProcessingJob(supabase, jobId, {
      artifactId,
      idempotencyKey,
      extractor,
      output: result,
    });

    return {
      skipped: false,
      idempotencyKey,
      extractor,
      output: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown classification error";
    await failProcessingJob(supabase, jobId, {
      artifactId,
      idempotencyKey,
      extractor,
      error: message,
    });
    throw error;
  }
}
