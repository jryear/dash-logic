// Traces to: ARCHITECTURE-dash.md §3.1-§3.3, §8.1-§8.4; README.md Query Intelligence, Matt Language Layer

import { z } from "zod";

const AllowedRpcSchema = z.enum([
  "resolve_supplier",
  "resolve_sku",
  "get_commitment_status",
  "list_open_commitments",
  "get_reconciliation_deltas",
  "get_recent_communications",
  "get_fulfillment_state",
  "get_payment_obligations",
  "get_evidence_for_claim",
  "search_evidence_text",
  "search_entities_fuzzy",
  "resolve_po_number",
]);

const QueryIntentSchema = z.enum([
  "status_check",
  "reconciliation",
  "payment_status",
  "communication_check",
  "evidence_lookup",
  "entity_search",
  "out_of_scope",
]);

export const BANNED_RESPONSE_PHRASES = [
  "fact",
  "inference",
  "unknown",
  "epistemic",
  "confidence",
  "ledger",
  "commitment",
  "event sourcing",
  "projection",
  "materialized view",
  "pipeline stage",
  "extraction pipeline",
] as const;

function containsBannedPhrase(input: string) {
  const normalized = input.toLowerCase();
  return BANNED_RESPONSE_PHRASES.some((phrase) => normalized.includes(phrase));
}

export const QueryStepSchema = z.object({
  step_id: z.string().min(1),
  rpc: AllowedRpcSchema,
  args: z.record(z.unknown()),
  depends_on: z.array(z.string()).default([]),
  required_from_dependency: z
    .array(
      z.object({
        step_id: z.string().min(1),
        field_path: z.string().min(1),
        as: z.string().min(1),
      }),
    )
    .default([]),
});

export const QueryPlanSchema = z
  .object({
    intent: QueryIntentSchema,
    steps: z.array(QueryStepSchema),
    response_contract: z.literal("claims_with_evidence_spans"),
    schema_version: z.literal("v1"),
  })
  .superRefine((plan, ctx) => {
    const seen = new Set<string>();

    for (const step of plan.steps) {
      if (seen.has(step.step_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step_id: ${step.step_id}`,
          path: ["steps"],
        });
      }
      seen.add(step.step_id);
    }
  });

export const ResponseClaimSchema = z
  .object({
    text: z.string().min(1),
    epistemic_class: z.enum(["FACT", "INFERENCE", "UNKNOWN"]),
    evidence_span_ids: z.array(z.number().int().positive()).default([]),
    reasoning: z.string().nullable().default(null),
    missing_data: z.string().nullable().default(null),
    suggested_action: z.string().nullable().default(null),
  })
  .superRefine((claim, ctx) => {
    if (containsBannedPhrase(claim.text)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Claim text contains banned Matt-facing phrasing.",
        path: ["text"],
      });
    }

    if (claim.epistemic_class === "FACT" && claim.evidence_span_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FACT claims must include evidence_span_ids.",
        path: ["evidence_span_ids"],
      });
    }

    if (claim.epistemic_class === "INFERENCE" && !claim.reasoning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INFERENCE claims must include reasoning.",
        path: ["reasoning"],
      });
    }

    if (claim.epistemic_class === "UNKNOWN") {
      if (!claim.missing_data) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UNKNOWN claims must state missing_data.",
          path: ["missing_data"],
        });
      }

      if (!claim.suggested_action) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UNKNOWN claims must include suggested_action text.",
          path: ["suggested_action"],
        });
      }
    }
  });

export const SuggestedActionSchema = z.object({
  action_type: z.enum([
    "request_update",
    "view_evidence",
    "dispute_invoice",
    "confirm_receipt",
    "send_followup",
    "view_thread",
  ]),
  label: z.string().min(1),
  context: z.record(z.unknown()),
});

export const QueryResponseSchema = z
  .object({
    claims: z.array(ResponseClaimSchema),
    summary: z.string().min(1),
    suggested_actions: z.array(SuggestedActionSchema),
    query_intent: z.string().min(1),
    schema_version: z.literal("v1"),
  })
  .superRefine((response, ctx) => {
    if (containsBannedPhrase(response.summary)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Summary contains banned Matt-facing phrasing.",
        path: ["summary"],
      });
    }
  });

export const QueryRequestSchema = z.object({
  query: z.string().min(1),
});

export const ExecutedStepSchema = z.object({
  step_id: z.string(),
  rpc: AllowedRpcSchema,
  args: z.record(z.unknown()),
  status: z.enum(["completed", "failed", "failed_dependency", "fanout_clamped"]),
  data: z.unknown().nullable(),
  error: z.string().nullable(),
  missing_field_path: z.string().nullable().default(null),
  upstream_step_id: z.string().nullable().default(null),
});

export const QueryExecutionResultSchema = z.object({
  steps: z.record(ExecutedStepSchema),
  ordered_step_ids: z.array(z.string()),
});

export type AllowedRpc = z.infer<typeof AllowedRpcSchema>;
export type QueryIntent = z.infer<typeof QueryIntentSchema>;
export type QueryStep = z.infer<typeof QueryStepSchema>;
export type QueryPlan = z.infer<typeof QueryPlanSchema>;
export type ResponseClaim = z.infer<typeof ResponseClaimSchema>;
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;
export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export type ExecutedStep = z.infer<typeof ExecutedStepSchema>;
export type QueryExecutionResult = z.infer<typeof QueryExecutionResultSchema>;
