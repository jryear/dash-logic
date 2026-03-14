// Traces to: ARCHITECTURE-dash.md §3.1-§3.3, §8.3-§8.4; README.md Matt Language Layer

import { requestStructuredObjectWithRaw } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import {
  BANNED_RESPONSE_PHRASES,
  QueryResponseSchema,
  type QueryExecutionResult,
  type QueryPlan,
  type QueryResponse,
} from "@/lib/query/types";
import { stableStringify } from "@/pipeline/utils";

const COMPOSE_SYSTEM_PROMPT = `
You are Dash's answer composer.

You receive a user question, a structured query plan, and structured RPC results.
Your job is to produce a response that obeys Dash's epistemological rules.

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
- summary is the complete natural-language answer Matt sees.
- schema_version must be "v1".

Return JSON only.
`.trim();

function extractSummaryFallback(rawText: string) {
  const summaryMatch = rawText.match(/"summary"\s*:\s*"([^"]+)"/);
  if (summaryMatch?.[1]) {
    return summaryMatch[1];
  }

  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function sanitizeFallbackSummary(summary: string) {
  const normalized = summary.toLowerCase();

  if (BANNED_RESPONSE_PHRASES.some((phrase) => normalized.includes(phrase)) || !summary) {
    return "I found relevant supplier data, but I couldn't format the full answer cleanly. Ask again for the latest order, shipment, invoice, or communication status.";
  }

  return summary;
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
  const { rawText, parsed, parseError } = await requestStructuredObjectWithRaw<QueryResponse>({
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

Compose the final answer.
`.trim(),
  });

  if (parsed === null) {
    return {
      response: {
        claims: [],
        summary: sanitizeFallbackSummary(extractSummaryFallback(rawText)),
        suggested_actions: [],
        query_intent: plan.intent,
        schema_version: "v1",
      },
      validationError: parseError,
    };
  }

  const parsedResult = QueryResponseSchema.safeParse(parsed);

  if (parsedResult.success) {
    return {
      response: parsedResult.data,
      validationError: null,
    };
  }

  return {
    response: {
      claims: [],
      summary: sanitizeFallbackSummary(extractSummaryFallback(rawText)),
      suggested_actions: [],
      query_intent: plan.intent,
      schema_version: "v1",
    },
    validationError: parsedResult.error.issues.map((issue) => issue.message).join("; "),
  };
}
