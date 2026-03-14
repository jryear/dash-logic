// Traces to: ARCHITECTURE-dash.md §8.1-§8.2; README.md Query Intelligence

import { requestStructuredObject } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import { QueryPlanSchema, type QueryPlan } from "@/lib/query/types";

const DECOMPOSE_SYSTEM_PROMPT = `
You are Dash's query planner.

Your job is to convert a user question into a structured query plan that uses ONLY this RPC allowlist:
- resolve_supplier(p_name text): fuzzy match supplier name to a partner
- resolve_sku(p_text text): fuzzy match SKU text to a sku
- get_commitment_status(p_commitment_id uuid): latest state of one order/promise
- list_open_commitments(p_partner_id uuid, p_date_range tstzrange): active commitments for a supplier or all suppliers
- get_reconciliation_deltas(p_commitment_id uuid): committed vs fulfilled comparison
- get_recent_communications(p_relationship_id uuid, p_limit int): latest messages for a relationship
- get_fulfillment_state(p_commitment_id uuid): fulfillment events for a commitment
- get_payment_obligations(p_date_range tstzrange): invoices/payments in a time window
- get_evidence_for_claim(p_evidence_span_ids bigint[]): evidence spans and artifact metadata
- search_evidence_text(p_query text, p_limit int): full-text search over evidence
- search_entities_fuzzy(p_query text, p_entity_type text): fuzzy search partners, skus, or contacts

Rules:
- Never invent SQL.
- Never invent RPCs outside this list.
- Steps may depend on prior steps.
- Use string placeholders for dependencies. Format: "$step_id.path.to.value"
- For arrays, use numeric indexes. Example: "$open_commitments.0.commitment_id"
- If the question is unrelated to supplier operations, set intent to "out_of_scope" and return zero steps.
- Prefer the smallest plan that can answer the question.
- response_contract must always be "claims_with_evidence_spans".
- schema_version must always be "v1".

Return JSON only.
`.trim();

export async function decomposeQuery(query: string): Promise<QueryPlan> {
  const plan = await requestStructuredObject<QueryPlan>({
    model: MODEL_ROUTING.query_decompose,
    system: DECOMPOSE_SYSTEM_PROMPT,
    maxTokens: 1400,
    prompt: `
User query:
${query}

Produce a plan that can answer the question using the allowlisted RPCs only.
`.trim(),
  });

  return QueryPlanSchema.parse(plan);
}
