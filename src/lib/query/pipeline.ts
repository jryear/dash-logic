// Traces to: ARCHITECTURE-dash.md §8.1-§8.4, §3.1-§3.3; README.md Milestone 5

import { composeQueryResponse } from "@/lib/query/compose";
import { decomposeQuery } from "@/lib/query/decompose";
import { executeQueryPlan } from "@/lib/query/execute";
import type { QueryResponse } from "@/lib/query/types";

const OUT_OF_SCOPE_RESPONSE: QueryResponse = {
  claims: [
    {
      text: "I can help with supplier relationships, orders, shipments, invoices, and communications.",
      epistemic_class: "UNKNOWN",
      evidence_span_ids: [],
      reasoning: null,
      missing_data: "This question is outside supplier operations.",
      suggested_action: "Ask about a specific supplier, order, shipment, invoice, or email thread.",
    },
  ],
  summary:
    "I can help with supplier relationships, orders, shipments, invoices, and communications. Try asking about a specific order or supplier.",
  suggested_actions: [],
  query_intent: "out_of_scope",
  schema_version: "v1",
};

export async function runQueryPipeline(query: string) {
  const plan = await decomposeQuery(query);

  if (plan.intent === "out_of_scope") {
    return {
      plan,
      execution: null,
      response: OUT_OF_SCOPE_RESPONSE,
      validationError: null,
    };
  }

  const execution = await executeQueryPlan(plan);
  const { response, validationError } = await composeQueryResponse({
    query,
    plan,
    execution,
  });

  return {
    plan,
    execution,
    response,
    validationError,
  };
}
