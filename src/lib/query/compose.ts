// Traces to: ARCHITECTURE-dash.md §3.1-§3.3, §8.3-§8.4; README.md Matt Language Layer

import { requestStructuredObject, requestStructuredObjectWithRaw } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import {
  BANNED_RESPONSE_PHRASES,
  QueryResponseSchema,
  SuggestedActionSchema,
  ResponseClaimSchema,
  type QueryExecutionResult,
  type QueryPlan,
  type QueryResponse,
} from "@/lib/query/types";
import { stableStringify } from "@/pipeline/utils";
import { z } from "zod";

export const StructuredComposeSchema = z.object({
  claims: z.array(ResponseClaimSchema),
  suggested_actions: z.array(SuggestedActionSchema),
  query_intent: z.string().min(1),
  schema_version: z.literal("v1"),
});

type StructuredCompose = z.infer<typeof StructuredComposeSchema>;

export const COMPOSE_SYSTEM_PROMPT = `
You are Dash's answer composer.

You receive a user question, a structured query plan, and structured RPC results.
Your first job is to produce a strictly valid structured response object.

Rules:
- Every claim must be exactly one of FACT, INFERENCE, or UNKNOWN.
- FACT claims use definitive language and must cite evidence_span_ids.
- INFERENCE claims use qualified language such as "likely", "estimated", or "based on", and include reasoning.
- UNKNOWN claims must state what is missing and suggest a specific next action.
- Never use these words in user-facing text: Fact, Inference, Unknown, epistemic, confidence, ledger, commitment, event sourcing, projection, materialized view, pipeline stage, extraction pipeline.
- Do not mention internal architecture.
- Always attach related deadlines, payment obligations, and discrepancies when the results support them.
- If tracking or receipt data is missing, say so explicitly.
- If an invoice does not match receipt, surface that mismatch clearly and add a dispute action.
- If a step failed, say you could not retrieve that part rather than bluffing.
- When is_time_uncertain is true, do not present the event time as factual chronology. Use qualified language and state why the timing is uncertain.
- Return ONLY this structured object shape:
  {
    "claims": [...],
    "suggested_actions": [...],
    "query_intent": "...",
    "schema_version": "v1"
  }
- Do not use alias keys such as "type", "statement", "missing", "action", or "priority".
- Use only these canonical keys:
  - claims[].text
  - claims[].epistemic_class
  - claims[].evidence_span_ids
  - claims[].reasoning
  - claims[].missing_data
  - claims[].suggested_action
  - suggested_actions[].action_type
  - suggested_actions[].label
  - suggested_actions[].context

Example valid object:
{
  "claims": [
    {
      "text": "Pacific Packaging says production is complete for PO 4412.",
      "epistemic_class": "FACT",
      "evidence_span_ids": [2001],
      "reasoning": null,
      "missing_data": null,
      "suggested_action": null
    },
    {
      "text": "The shipment timing is still unclear because no tracking update is recorded.",
      "epistemic_class": "UNKNOWN",
      "evidence_span_ids": [],
      "reasoning": null,
      "missing_data": "No shipment confirmation, carrier assignment, or tracking data is recorded.",
      "suggested_action": "Request an updated ship date and tracking number."
    }
  ],
  "suggested_actions": [
    {
      "action_type": "request_update",
      "label": "Request ship date",
      "context": { "source": "query_compose_example", "partner_name": "Pacific Packaging" }
    },
    {
      "action_type": "view_thread",
      "label": "View email thread",
      "context": { "source": "query_compose_example", "relationship_id": "00000000-0000-0000-0000-000000000301" }
    }
  ],
  "query_intent": "status_check",
  "schema_version": "v1"
}

Do not include summary. Summary is rendered after validation.
Return JSON only.
`.trim();

const REPAIR_SYSTEM_PROMPT = `
You repair Dash structured response objects to match a strict schema.

Rules:
- Return only valid JSON.
- Preserve the meaning of the original answer.
- Fix missing required fields.
- Remove banned internal language from claim text.
- UNKNOWN claims must include missing_data and suggested_action.
- FACT claims must include evidence_span_ids.
- INFERENCE claims must include reasoning.
- Do not add fields outside the schema.
`.trim();

function inferActionType(label: string) {
  const normalized = label.toLowerCase();

  if (/(request|reach out|contact)/i.test(normalized)) {
    return "request_update" as const;
  }

  if (/follow up/i.test(normalized)) {
    return "send_followup" as const;
  }

  if (/dispute/i.test(normalized)) {
    return "dispute_invoice" as const;
  }

  if (/(thread|email)/i.test(normalized)) {
    return "view_thread" as const;
  }

  if (/(evidence|proof|show me)/i.test(normalized)) {
    return "view_evidence" as const;
  }

  if (/(receipt|received|confirm receipt)/i.test(normalized)) {
    return "confirm_receipt" as const;
  }

  return "request_update" as const;
}

function coerceEvidenceSpanIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const numericIds = value
    .map((entry) => {
      if (typeof entry === "number" && Number.isInteger(entry) && entry > 0) {
        return entry;
      }

      if (typeof entry === "string" && /^\d+$/.test(entry)) {
        return Number.parseInt(entry, 10);
      }

      return null;
    })
    .filter((entry): entry is number => entry !== null);

  return [...new Set(numericIds)];
}

function normalizeClaim(claim: unknown) {
  if (!claim || typeof claim !== "object") {
    return claim;
  }

  const source = claim as Record<string, unknown>;

  const normalizedClaim = {
    text: sanitizeText(
      typeof source.text === "string" ? source.text : typeof source.statement === "string" ? source.statement : "",
    ),
    epistemic_class:
      typeof source.epistemic_class === "string"
        ? source.epistemic_class
        : typeof source.type === "string"
          ? source.type
          : undefined,
    evidence_span_ids: coerceEvidenceSpanIds(source.evidence_span_ids),
    reasoning: typeof source.reasoning === "string" ? sanitizeText(source.reasoning) : null,
    missing_data:
      typeof source.missing_data === "string"
        ? sanitizeText(source.missing_data)
        : typeof source.missing === "string"
          ? sanitizeText(source.missing)
          : null,
    suggested_action: typeof source.suggested_action === "string" ? sanitizeText(source.suggested_action) : null,
  };

  if (normalizedClaim.epistemic_class === "FACT" && normalizedClaim.evidence_span_ids.length === 0) {
    if (normalizedClaim.reasoning) {
      normalizedClaim.epistemic_class = "INFERENCE";
    } else {
      normalizedClaim.epistemic_class = "UNKNOWN";
      normalizedClaim.missing_data = normalizedClaim.missing_data ?? "No supporting evidence spans available.";
      normalizedClaim.suggested_action =
        normalizedClaim.suggested_action ?? "Review the source record before treating this as confirmed.";
    }
  }

  return normalizedClaim;
}

function normalizeSuggestedAction(action: unknown) {
  if (!action || typeof action !== "object") {
    return action;
  }

  const source = action as Record<string, unknown>;
  const label =
    typeof source.label === "string" ? source.label : typeof source.action === "string" ? source.action : "";

  return {
    action_type:
      typeof source.action_type === "string" && source.action_type.length > 0
        ? source.action_type
        : inferActionType(label),
    label: sanitizeText(label),
    context:
      source.context && typeof source.context === "object" && !Array.isArray(source.context)
        ? source.context
        : { source: "compose_adapter", inferred: true },
  };
}

function normalizeStructuredComposeCandidate(input: unknown) {
  if (!input || typeof input !== "object") {
    return input;
  }

  const source = input as Record<string, unknown>;

  return {
    claims: Array.isArray(source.claims) ? source.claims.map(normalizeClaim) : [],
    suggested_actions: Array.isArray(source.suggested_actions)
      ? source.suggested_actions.map(normalizeSuggestedAction)
      : [],
    query_intent: typeof source.query_intent === "string" ? sanitizeText(source.query_intent) : "",
    schema_version: source.schema_version,
  };
}

function normalizeStructuredCompose(input: StructuredCompose | unknown) {
  return StructuredComposeSchema.parse(normalizeStructuredComposeCandidate(input));
}

function sanitizeText(input: string) {
  let output = input;
  for (const phrase of BANNED_RESPONSE_PHRASES) {
    const pattern = new RegExp(phrase, "ig");
    output = output.replace(pattern, "").trim();
  }
  return output.replace(/\s+/g, " ").trim();
}

function containsTimeUncertainty(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsTimeUncertainty);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.is_time_uncertain === true) {
      return true;
    }
    return Object.values(record).some(containsTimeUncertainty);
  }

  return false;
}

const UNSAFE_DEFINITE_TEMPORAL_PATTERN =
  /\b(as of\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)|on\s+\d{4}-\d{2}-\d{2}|on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}|was shipped on|arrived on|delivered on|confirmed on|over a year ago|more than a year ago)\b/i;

function enforceTemporalSafety(response: StructuredCompose, execution: QueryExecutionResult) {
  if (!containsTimeUncertainty(execution)) {
    return response;
  }

  return {
    ...response,
    claims: response.claims.map((claim) => {
      const temporalText = [claim.text, claim.reasoning ?? ""].join(" ");
      if (!UNSAFE_DEFINITE_TEMPORAL_PATTERN.test(temporalText)) {
        return claim;
      }

      return {
        ...claim,
        epistemic_class: claim.epistemic_class === "FACT" ? "INFERENCE" : claim.epistemic_class,
        text: "Based on available records, timing is uncertain because no explicit date was captured in the source material, so I can't confirm the precise chronology for this step.",
        reasoning:
          "The available record indicates a relevant event, but the stored timing relies on an uncertain fallback rather than an explicit source date.",
        missing_data:
          claim.epistemic_class === "UNKNOWN"
            ? claim.missing_data ?? "No explicit source date is available for this timeline step."
            : claim.missing_data,
      };
    }),
  };
}

function renderSummaryFromStructured(response: StructuredCompose) {
  const claimLines = response.claims.map((claim) => sanitizeText(claim.text)).filter(Boolean);
  const actionLabels = response.suggested_actions.map((action) => action.label).filter(Boolean);

  const summary = [claimLines.join(" "), actionLabels.length > 0 ? `Next steps: ${actionLabels.join("; ")}.` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!summary || BANNED_RESPONSE_PHRASES.some((phrase) => summary.toLowerCase().includes(phrase))) {
    return "I found relevant supplier data, but I couldn't format the full answer cleanly. Ask again for the latest order, shipment, invoice, or communication status.";
  }

  return summary;
}

function renderSummaryWithTemporalSafety(response: StructuredCompose, execution: QueryExecutionResult) {
  const summary = renderSummaryFromStructured(response);

  if (!containsTimeUncertainty(execution)) {
    return summary;
  }

  const prefixed = /^based on available records,/i.test(summary)
    ? summary
    : `Based on available records, ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;

  if (/i can't confirm a precise timeline beyond what .* reports/i.test(prefixed)) {
    return prefixed;
  }

  return `${prefixed} I can't confirm a precise timeline beyond what the available records and supplier updates report.`;
}

async function repairStructuredCompose({
  query,
  plan,
  execution,
  rawText,
  validationErrors,
}: {
  query: string;
  plan: QueryPlan;
  execution: QueryExecutionResult;
  rawText: string;
  validationErrors: string;
}) {
  return requestStructuredObject<StructuredCompose>({
    model: MODEL_ROUTING.query_compose,
    system: REPAIR_SYSTEM_PROMPT,
    maxTokens: 1800,
    prompt: `
User query:
${query}

Structured plan:
${stableStringify(plan)}

Structured execution results:
${stableStringify(execution)}

Original invalid object:
${rawText}

Validation errors:
${validationErrors}

Return a repaired object that matches the required schema exactly.
`.trim(),
  });
}

export async function composeQueryResponse({
  query,
  plan,
  execution,
}: {
  query: string;
  plan: QueryPlan;
  execution: QueryExecutionResult;
}): Promise<{ response: QueryResponse; validationError: string | null }> {
  const initial = await requestStructuredObjectWithRaw<StructuredCompose>({
    model: MODEL_ROUTING.query_compose,
    system: COMPOSE_SYSTEM_PROMPT,
    maxTokens: 2200,
    prompt: `
User query:
${query}

Structured plan:
${stableStringify(plan)}

Structured execution results:
${stableStringify(execution)}

Compose the structured answer.
`.trim(),
  });

  let structured: StructuredCompose | null = null;
  let validationError: string | null = null;

  if (initial.parsed !== null) {
    const parsedResult = StructuredComposeSchema.safeParse(normalizeStructuredComposeCandidate(initial.parsed));
    if (parsedResult.success) {
      structured = parsedResult.data;
    } else {
      validationError = parsedResult.error.issues.map((issue) => issue.message).join("; ");
    }
  } else {
    validationError = initial.parseError;
  }

  if (!structured) {
    try {
      const repaired = await repairStructuredCompose({
        query,
        plan,
        execution,
        rawText: initial.rawText,
        validationErrors: validationError ?? "Initial parse failed.",
      });
      const repairedResult = StructuredComposeSchema.safeParse(normalizeStructuredComposeCandidate(repaired));

      if (repairedResult.success) {
        structured = repairedResult.data;
        validationError = null;
      } else {
        validationError = repairedResult.error.issues.map((issue) => issue.message).join("; ");
      }
    } catch (error) {
      validationError = error instanceof Error ? error.message : "Structured response repair failed.";
    }
  }

  if (!structured) {
    return {
      response: {
        claims: [],
        summary:
          "I found relevant supplier data, but I couldn't format the full answer cleanly. Ask again for the latest order, shipment, invoice, or communication status.",
        suggested_actions: [],
        query_intent: plan.intent,
        schema_version: "v1",
      },
      validationError,
    };
  }

  structured = normalizeStructuredCompose(enforceTemporalSafety(structured, execution));

  const response = QueryResponseSchema.parse({
    ...structured,
    summary: renderSummaryWithTemporalSafety(structured, execution),
  });

  return {
    response,
    validationError,
  };
}
