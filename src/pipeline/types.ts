// Traces to: ARCHITECTURE-dash.md §7.1-§7.4, README.md Milestone 3

import { z } from "zod";

export const DocumentTypeSchema = z.enum([
  "purchase_order",
  "invoice",
  "shipping_notification",
  "status_update",
  "check_in",
  "terms_agreement",
  "negotiation",
  "noise",
]);

export const ClassificationResultSchema = z.object({
  document_type: DocumentTypeSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  schema_version: z.literal("v1"),
});

export const EntityExtractionResultSchema = z.object({
  partners: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["supplier", "manufacturer", "distributor", "freight", "three_pl"]).nullable(),
      email_domain: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  contacts: z.array(
    z.object({
      name: z.string(),
      email: z.string().nullable(),
      role: z.string().nullable(),
      partner_reference: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  skus: z.array(
    z.object({
      reference: z.string(),
      description: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  quantities: z.array(
    z.object({
      value: z.number(),
      unit: z.string(),
      sku_reference: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  dates: z.array(
    z.object({
      value: z.string(),
      context: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  amounts: z.array(
    z.object({
      value: z.number(),
      currency: z.string().default("USD"),
      context: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  evidence_spans: z.array(
    z.object({
      text: z.string(),
      char_start: z.number().nullable(),
      char_end: z.number().nullable(),
      supports: z.string(),
    }),
  ),
  schema_version: z.literal("v1"),
});

export const ExtractorProvenanceSchema = z.object({
  name: z.string(),
  version: z.string(),
  model: z.string(),
  prompt_sha256: z.string(),
  schema_version: z.string(),
});

export const ResolutionOutcomeSchema = z.enum(["matched", "ambiguous", "new"]);
export const ProposalTargetTableSchema = z.enum(["commitment_events", "fulfillment_events"]);
export const CommitmentEventTypeSchema = z.enum([
  "created",
  "term_set",
  "quantity_committed",
  "milestone_set",
  "status_updated",
  "amended",
  "cancelled",
  "invoice_issued",
  "payment_made",
]);
export const FulfillmentEventTypeSchema = z.enum([
  "shipped",
  "received",
  "delivered",
  "partial_received",
  "returned",
]);

export const ResolutionCandidateSchema = z.object({
  entity_id: z.string(),
  name: z.string(),
  similarity: z.number().nullable(),
  entity_type: z.enum(["partner", "sku", "contact"]),
});

export const ResolvedPartnerSchema = z.object({
  input_name: z.string(),
  outcome: ResolutionOutcomeSchema,
  matched_partner_id: z.string().nullable(),
  similarity: z.number().nullable(),
  candidates: z.array(ResolutionCandidateSchema),
});

export const ResolvedContactSchema = z.object({
  input_name: z.string(),
  input_email: z.string().nullable(),
  outcome: ResolutionOutcomeSchema,
  matched_contact_id: z.string().nullable(),
  similarity: z.number().nullable(),
  candidates: z.array(ResolutionCandidateSchema),
});

export const ResolvedSkuSchema = z.object({
  input_reference: z.string(),
  outcome: ResolutionOutcomeSchema,
  matched_sku_id: z.string().nullable(),
  similarity: z.number().nullable(),
  candidates: z.array(ResolutionCandidateSchema),
});

export const EntityResolutionResultSchema = z.object({
  partners: z.array(ResolvedPartnerSchema),
  contacts: z.array(ResolvedContactSchema),
  skus: z.array(ResolvedSkuSchema),
  review_required: z.boolean(),
  schema_version: z.literal("v1"),
});

export const CommitmentProposalSchema = z
  .object({
    target_table: ProposalTargetTableSchema,
    commitment_id: z.string().uuid().nullable(),
    event_type: z.string(),
    event_time: z.string(),
    event_time_source: z.enum(["extracted", "artifact_metadata", "inferred_fallback"]),
    event_time_confidence: z.enum(["high", "medium", "low"]),
    event_time_reason: z.string().nullable().default(null),
    event_time_provenance: z.record(z.unknown()).default({}),
    relationship_id: z.string().uuid(),
    payload: z.record(z.unknown()),
    evidence_span_ids: z.array(z.number().int().positive()),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    schema_version: z.literal("v1"),
  })
  .superRefine((proposal, ctx) => {
    const validEventType =
      proposal.target_table === "commitment_events"
        ? CommitmentEventTypeSchema.safeParse(proposal.event_type).success
        : FulfillmentEventTypeSchema.safeParse(proposal.event_type).success;

    if (!validEventType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid event_type ${proposal.event_type} for ${proposal.target_table}`,
        path: ["event_type"],
      });
    }

    if (
      !proposal.payload ||
      typeof proposal.payload !== "object" ||
      (proposal.payload as Record<string, unknown>).schema_version !== "v1"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payload.schema_version must be v1",
        path: ["payload", "schema_version"],
      });
    }

    if (
      proposal.event_time_source === "inferred_fallback" &&
      (!proposal.event_time_reason ||
        Object.keys(proposal.event_time_provenance ?? {}).length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fallback event_time values require reason and provenance.",
        path: ["event_time_source"],
      });
    }
  });

export const CommitmentExtractionResultSchema = z.object({
  proposals: z.array(CommitmentProposalSchema),
  non_commitments: z.array(
    z.object({
      text: z.string(),
      reasoning: z.string(),
    }),
  ),
  schema_version: z.literal("v1"),
});

export const LedgerWrittenRecordSchema = z.object({
  event_id: z.number().int().positive(),
  target_table: ProposalTargetTableSchema,
  commitment_id: z.string().uuid(),
  idempotency_key: z.string(),
});

export const LedgerWrittenEventSchema = z.object({
  artifactId: z.number().int().positive(),
  records: z.array(LedgerWrittenRecordSchema),
  schema_version: z.literal("v1"),
});

export const ArtifactReceivedEventSchema = z.object({
  artifactId: z.number().int().positive(),
});

export const ArtifactClassifiedEventSchema = z.object({
  artifactId: z.number().int().positive(),
  classification: ClassificationResultSchema,
  extractor: ExtractorProvenanceSchema,
  idempotencyKey: z.string(),
});

export const ArtifactEntitiesExtractedEventSchema = z.object({
  artifactId: z.number().int().positive(),
  classification: ClassificationResultSchema,
  extraction: EntityExtractionResultSchema,
  extractor: ExtractorProvenanceSchema,
  idempotencyKey: z.string(),
});

export const ArtifactEntitiesResolvedEventSchema = z.object({
  artifactId: z.number().int().positive(),
  classification: ClassificationResultSchema,
  extraction: EntityExtractionResultSchema,
  resolution: EntityResolutionResultSchema,
  extractor: ExtractorProvenanceSchema,
  idempotencyKey: z.string(),
});

export const ArtifactCommitmentsExtractedEventSchema = z.object({
  artifactId: z.number().int().positive(),
  classification: ClassificationResultSchema,
  extraction: EntityExtractionResultSchema,
  resolution: EntityResolutionResultSchema,
  commitments: CommitmentExtractionResultSchema,
  extractor: ExtractorProvenanceSchema,
  idempotencyKey: z.string(),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
export type EntityExtractionResult = z.infer<typeof EntityExtractionResultSchema>;
export type EntityResolutionResult = z.infer<typeof EntityResolutionResultSchema>;
export type CommitmentExtractionResult = z.infer<typeof CommitmentExtractionResultSchema>;
export type CommitmentProposal = z.infer<typeof CommitmentProposalSchema>;
export type ExtractorProvenance = z.infer<typeof ExtractorProvenanceSchema>;
export type ArtifactReceivedEvent = z.infer<typeof ArtifactReceivedEventSchema>;
export type ArtifactClassifiedEvent = z.infer<typeof ArtifactClassifiedEventSchema>;
export type ArtifactEntitiesExtractedEvent = z.infer<typeof ArtifactEntitiesExtractedEventSchema>;
export type ArtifactEntitiesResolvedEvent = z.infer<typeof ArtifactEntitiesResolvedEventSchema>;
export type ArtifactCommitmentsExtractedEvent = z.infer<typeof ArtifactCommitmentsExtractedEventSchema>;
export type LedgerWrittenEvent = z.infer<typeof LedgerWrittenEventSchema>;
