/**
 * Fast validation for planner and execution contract hardening.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/validate-query-contracts.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-for-contracts";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-for-contracts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { QueryPlanSchema } = await import("../src/lib/query/types");
  const { validateQueryPlan } = await import("../src/lib/query/execute");
  type QueryExecutionResult = import("../src/lib/query/types").QueryExecutionResult;

  const validPlan = QueryPlanSchema.parse({
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
        step_id: "open_commitments",
        rpc: "list_open_commitments",
        args: { p_partner_id: null, p_date_range: null },
        depends_on: [],
        required_from_dependency: [],
      },
      {
        step_id: "fulfillment",
        rpc: "get_fulfillment_state",
        args: { p_commitment_id: null },
        depends_on: ["open_commitments"],
        required_from_dependency: [
          { step_id: "open_commitments", field_path: "0.commitment_id", as: "p_commitment_id" },
        ],
      },
    ],
    response_contract: "claims_with_evidence_spans",
    schema_version: "v1",
  });

  const validResult = validateQueryPlan(validPlan);
  assert(validResult.valid, `Expected valid plan. Got: ${JSON.stringify(validResult.issues)}`);

  const pseudoSqlPlan = QueryPlanSchema.parse({
    intent: "status_check",
    steps: [
      {
        step_id: "open_commitments",
        rpc: "list_open_commitments",
        args: { p_partner_id: null, p_date_range: "[now()-interval '7 days', now()]" },
        depends_on: [],
        required_from_dependency: [],
      },
    ],
    response_contract: "claims_with_evidence_spans",
    schema_version: "v1",
  });

  const pseudoSqlResult = validateQueryPlan(pseudoSqlPlan);
  assert(
    !pseudoSqlResult.valid &&
      pseudoSqlResult.issues.some((issue: { error: string }) => issue.error.includes("pseudo-SQL")),
    "Expected pseudo-SQL plan to be rejected.",
  );

  const badDependencyPlan = QueryPlanSchema.parse({
    intent: "status_check",
    steps: [
      {
        step_id: "search_po",
        rpc: "search_evidence_text",
        args: { p_query: "PO #4412", p_limit: 5 },
        depends_on: [],
        required_from_dependency: [],
      },
      {
        step_id: "commitment_status",
        rpc: "get_commitment_status",
        args: { p_commitment_id: null },
        depends_on: ["search_po"],
        required_from_dependency: [
          { step_id: "search_po", field_path: "0.commitment_id", as: "p_commitment_id" },
        ],
      },
    ],
    response_contract: "claims_with_evidence_spans",
    schema_version: "v1",
  });

  const badDependencyResult = validateQueryPlan(badDependencyPlan);
  assert(
    !badDependencyResult.valid &&
      badDependencyResult.issues.some((issue: { error: string }) => issue.error.includes("field path")),
    "Expected nonexistent dependency field to be rejected.",
  );

  const failedDependencyTrace: QueryExecutionResult = {
    steps: {
      upstream: {
        step_id: "upstream",
        rpc: "search_evidence_text",
        args: { p_query: "PO #4412", p_limit: 5 },
        status: "completed",
        data: [{ evidence_span_id: 2001 }],
        error: null,
        missing_field_path: null,
        upstream_step_id: null,
      },
      downstream: {
        step_id: "downstream",
        rpc: "get_commitment_status",
        args: { p_commitment_id: null },
        status: "failed_dependency",
        data: null,
        error: "Missing dependency field 0.commitment_id from upstream.",
        missing_field_path: "0.commitment_id",
        upstream_step_id: "upstream",
      },
    },
    ordered_step_ids: ["upstream", "downstream"],
  };

  assert(
    failedDependencyTrace.steps.downstream.status === "failed_dependency" &&
      failedDependencyTrace.steps.downstream.missing_field_path === "0.commitment_id",
    "Expected failed_dependency trace to carry the missing field path.",
  );

  console.log("validateQueryPlan(validPlan): PASS");
  console.log("validateQueryPlan(pseudoSqlPlan): PASS");
  console.log("validateQueryPlan(badDependencyPlan): PASS");
  console.log("failed_dependency trace shape: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
