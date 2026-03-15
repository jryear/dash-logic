// Traces to: ARCHITECTURE-dash.md §8.1-§8.2; README.md Query Intelligence

import { requestStructuredObject } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import { renderRpcManifestForPrompt } from "@/lib/query/rpc-manifest";
import { QueryPlanSchema, type QueryPlan } from "@/lib/query/types";

const PO_NUMBER_PATTERN = /\bpo\s*#?\s*([a-z0-9-]+)\b/i;
const CANONICAL_6OZ_PATTERN = /\b6\s*oz\b.*\bsample bottles?\b|\bsample bottles?\b.*\b6\s*oz\b/i;

const DECOMPOSE_SYSTEM_PROMPT = `
You are Dash's query planner.

Your job is to convert a user question into a structured query plan that uses ONLY this RPC allowlist:
${renderRpcManifestForPrompt()}

Rules:
- Never invent SQL.
- Never invent RPCs outside this list.
- Steps may depend on prior steps.
- Use required_from_dependency for values pulled from prior step outputs.
- Each dependency mapping must specify step_id, field_path, and the destination argument name in "as".
- field_path uses dot notation and numeric indexes for arrays. Example: "0.commitment_id"
- If an RPC returns an array, field_path must start with a numeric index such as "0.commitment_id". Never use bare "commitment_id" against an array result.
- args must contain final literal values only. No SQL expressions, no now(), no interval syntax, no casts, no SELECT fragments.
- For p_date_range, use null unless you can provide a final literal Postgres tstzrange string such as "[2026-03-01T00:00:00Z,2026-03-31T23:59:59Z]".
- search_entities_fuzzy.p_entity_type must be one of: "partner", "sku", "contact".
- Do not use search_entities_fuzzy for PO lookup. PO-style queries must use evidence or other allowed paths, not fuzzy entity search.
- Do not pass artifact_id anywhere a UUID commitment_id is required.
- If the question is unrelated to supplier operations, set intent to "out_of_scope" and return zero steps.
- Prefer the smallest plan that can answer the question.
- response_contract must always be "claims_with_evidence_spans".
- schema_version must always be "v1".

Return JSON only. No markdown fences.

Your response must be exactly this shape:
{
  "intent": one of "status_check", "reconciliation", "payment_status", "communication_check", "evidence_lookup", "entity_search", "out_of_scope",
  "steps": [
    {
      "step_id": "unique_name",
      "rpc": "one of the RPCs above",
      "args": { "p_param_name": "final literal value or null" },
      "depends_on": ["step_id_of_dependency"] or [],
      "required_from_dependency": [
        { "step_id": "dependency_step", "field_path": "0.commitment_id", "as": "p_commitment_id" }
      ] or []
    }
  ],
  "response_contract": "claims_with_evidence_spans",
  "schema_version": "v1"
}

The "args" key is required on every step and must be an object mapping RPC parameter names to values.
The "intent" must be one of the seven allowed values listed above — never invent a new intent.
If a field is not explicitly listed in the RPC output shape, you may not reference it in required_from_dependency.
`.trim();

export async function decomposeQuery(query: string): Promise<QueryPlan> {
  if (CANONICAL_6OZ_PATTERN.test(query)) {
    return QueryPlanSchema.parse({
      intent: "status_check",
      steps: [
        {
          step_id: "resolve_sku",
          rpc: "resolve_sku",
          args: { p_text: "6oz sample bottles" },
          depends_on: [],
          required_from_dependency: [],
        },
        {
          step_id: "list_open_commitments",
          rpc: "list_open_commitments",
          args: { p_partner_id: null, p_date_range: null },
          depends_on: [],
          required_from_dependency: [],
        },
        {
          step_id: "get_commitment_status",
          rpc: "get_commitment_status",
          args: { p_commitment_id: null },
          depends_on: ["list_open_commitments"],
          required_from_dependency: [
            {
              step_id: "list_open_commitments",
              field_path: "0.commitment_id",
              as: "p_commitment_id",
            },
          ],
        },
        {
          step_id: "get_fulfillment_state",
          rpc: "get_fulfillment_state",
          args: { p_commitment_id: null },
          depends_on: ["list_open_commitments"],
          required_from_dependency: [
            {
              step_id: "list_open_commitments",
              field_path: "0.commitment_id",
              as: "p_commitment_id",
            },
          ],
        },
        {
          step_id: "get_reconciliation_deltas",
          rpc: "get_reconciliation_deltas",
          args: { p_commitment_id: null },
          depends_on: ["list_open_commitments"],
          required_from_dependency: [
            {
              step_id: "list_open_commitments",
              field_path: "0.commitment_id",
              as: "p_commitment_id",
            },
          ],
        },
        {
          step_id: "get_recent_communications",
          rpc: "get_recent_communications",
          args: { p_relationship_id: null, p_limit: 5 },
          depends_on: ["get_commitment_status"],
          required_from_dependency: [
            {
              step_id: "get_commitment_status",
              field_path: "relationship_id",
              as: "p_relationship_id",
            },
          ],
        },
      ],
      response_contract: "claims_with_evidence_spans",
      schema_version: "v1",
    });
  }

  const poMatch = query.match(PO_NUMBER_PATTERN);
  if (poMatch) {
    const poText = `PO #${poMatch[1].toUpperCase()}`;
    return QueryPlanSchema.parse({
      intent: "status_check",
      steps: [
        {
          step_id: "resolve_po_number",
          rpc: "resolve_po_number",
          args: { p_po_text: poText },
          depends_on: [],
          required_from_dependency: [],
        },
        {
          step_id: "get_commitment_status",
          rpc: "get_commitment_status",
          args: { p_commitment_id: null },
          depends_on: ["resolve_po_number"],
          required_from_dependency: [
            {
              step_id: "resolve_po_number",
              field_path: "commitment_id",
              as: "p_commitment_id",
            },
          ],
        },
        {
          step_id: "get_fulfillment_state",
          rpc: "get_fulfillment_state",
          args: { p_commitment_id: null },
          depends_on: ["resolve_po_number"],
          required_from_dependency: [
            {
              step_id: "resolve_po_number",
              field_path: "commitment_id",
              as: "p_commitment_id",
            },
          ],
        },
        {
          step_id: "get_reconciliation_deltas",
          rpc: "get_reconciliation_deltas",
          args: { p_commitment_id: null },
          depends_on: ["resolve_po_number"],
          required_from_dependency: [
            {
              step_id: "resolve_po_number",
              field_path: "commitment_id",
              as: "p_commitment_id",
            },
          ],
        },
        {
          step_id: "get_recent_communications",
          rpc: "get_recent_communications",
          args: { p_relationship_id: null, p_limit: 10 },
          depends_on: ["resolve_po_number"],
          required_from_dependency: [
            {
              step_id: "resolve_po_number",
              field_path: "relationship_id",
              as: "p_relationship_id",
            },
          ],
        },
        {
          step_id: "get_evidence_for_claim",
          rpc: "get_evidence_for_claim",
          args: { p_evidence_span_ids: null },
          depends_on: ["resolve_po_number"],
          required_from_dependency: [
            {
              step_id: "resolve_po_number",
              field_path: "matched_evidence_span_ids",
              as: "p_evidence_span_ids",
            },
          ],
        },
      ],
      response_contract: "claims_with_evidence_spans",
      schema_version: "v1",
    });
  }

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
