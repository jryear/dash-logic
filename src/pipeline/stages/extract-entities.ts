// Traces to: ARCHITECTURE-dash.md §7.2 Stage 2, README.md Milestone 3

import { requestStructuredObject } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  EntityExtractionResultSchema,
  type ClassificationResult,
  type EntityExtractionResult,
} from "@/pipeline/types";
import {
  buildIdempotencyKey,
  buildProvenance,
  completeProcessingJob,
  failProcessingJob,
  findExistingCompletedJob,
  loadArtifactText,
  stableStringify,
  startProcessingJob,
} from "@/pipeline/utils";

const EXTRACTOR_VERSION = "1.0.0";

const EXTRACTION_SYSTEM_PROMPT = `
You extract provisional operational entities from supplier artifacts for Dash.

Dash tracks suppliers, contacts, SKUs, quantities, dates, amounts, and evidence text that supports each claim.
You are not creating commitments yet. You are identifying nouns, numbers, and supporting passages.

Rules:
- Return JSON only. No markdown.
- Every entity gets a confidence score between 0 and 1.
- Dates must be ISO 8601 strings when explicit.
- Evidence spans must quote the source text exactly and say which entity they support.
- Use schema_version "v1".
`.trim();

function buildDocumentSpecificInstructions(documentType: ClassificationResult["document_type"]) {
  switch (documentType) {
    case "purchase_order":
      return "Focus on supplier name, buyer/seller contacts, SKU references, quantities, unit prices, totals, and ship/delivery dates.";
    case "invoice":
      return "Focus on supplier name, invoice amount, due dates, line items, SKU references, and payment terms.";
    case "shipping_notification":
      return "Focus on carrier, tracking details, shipment quantities, delivery estimates, receiving locations, and linked SKU references.";
    case "status_update":
      return "Focus on supplier names, milestone changes, quantities, dates, delays, and operational status signals.";
    case "check_in":
      return "Focus on conversational references to suppliers, contacts, and any weak status signal, but avoid inventing quantities or dates.";
    case "terms_agreement":
      return "Focus on partner names, contacts, MOQs, lead times, payment terms, and operational conditions.";
    case "negotiation":
      return "Focus on partner names, contacts, proposed prices, counter-offers, requested quantities, discount terms, and any conditional commitments. Evidence spans should capture the exact language of offers and counter-offers.";
    case "noise":
      return "Return empty arrays unless the message contains a clearly relevant supplier, contact, or SKU reference.";
    default:
      return "Focus on operationally relevant entities only.";
  }
}

export interface EntityExtractionStageResult {
  skipped: boolean;
  idempotencyKey: string;
  extractor: ReturnType<typeof buildProvenance>;
  output: EntityExtractionResult;
}

export async function runEntityExtractionStage(
  artifactId: number,
  classification: ClassificationResult,
): Promise<EntityExtractionStageResult> {
  const supabase = createAdminSupabaseClient();
  const artifactContext = await loadArtifactText(supabase, artifactId);
  const prompt = `${EXTRACTION_SYSTEM_PROMPT}\n\n${buildDocumentSpecificInstructions(classification.document_type)}`;
  const extractor = buildProvenance({
    name: "extract-entities-v1",
    version: EXTRACTOR_VERSION,
    model: MODEL_ROUTING.extract_entities,
    prompt,
  });
  const idempotencyKey = buildIdempotencyKey(artifactId, extractor.version, {
    classification,
    artifactText: artifactContext.text,
  });
  const existing = await findExistingCompletedJob<EntityExtractionResult>(
    supabase,
    artifactId,
    "extract_entities",
    idempotencyKey,
  );

  if (existing) {
    return {
      skipped: true,
      idempotencyKey,
      extractor,
      output: EntityExtractionResultSchema.parse(existing.payload.output),
    };
  }

  const jobId = await startProcessingJob(supabase, artifactId, "extract_entities", idempotencyKey, extractor);

  try {
    const result = EntityExtractionResultSchema.parse(
      await requestStructuredObject<EntityExtractionResult>({
        model: MODEL_ROUTING.extract_entities,
        system: prompt,
        maxTokens: 2400,
        prompt: `
Artifact ID: ${artifactId}
Document type: ${classification.document_type}
Classification confidence: ${classification.confidence}
Artifact metadata: ${stableStringify(artifactContext.artifact.metadata)}
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
    const message = error instanceof Error ? error.message : "Unknown entity extraction error";
    await failProcessingJob(supabase, jobId, {
      artifactId,
      idempotencyKey,
      extractor,
      error: message,
    });
    throw error;
  }
}
