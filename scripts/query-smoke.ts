/**
 * Validation: live canonical query smoke against the current Supabase + Anthropic setup.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/query-smoke.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-for-query-smoke";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-for-query-smoke";

const PROMPTS = [
  "Where are my 6oz sample bottles?",
  "What's overdue with Pacific Packaging this week?",
  "Show me any quantity mismatches right now.",
  "What invoices are at risk because shipping isn't confirmed?",
  "What changed since the last update on PO #4412?",
] as const;

async function main() {
  const { runQueryPipeline } = await import("../src/lib/query/pipeline");

  for (const prompt of PROMPTS) {
    console.log("============================================================");
    console.log(`QUERY: ${prompt}`);
    console.log();

    try {
      const result = await runQueryPipeline(prompt);

      console.log(`Intent: ${result.plan.intent}`);
      console.log(`Plan steps: ${result.plan.steps.length}`);
      console.log(`Validation error: ${result.validationError ?? "none"}`);
      console.log();

      console.log("Plan:");
      for (const step of result.plan.steps) {
        console.log(`  ${step.step_id}: ${step.rpc} depends_on=[${step.depends_on.join(", ")}]`);
        console.log(`    args: ${JSON.stringify(step.args)}`);
        if (step.required_from_dependency.length > 0) {
          console.log(`    required_from_dependency: ${JSON.stringify(step.required_from_dependency)}`);
        }
      }
      console.log();

      if (result.execution) {
        console.log("Execution:");
        for (const stepId of result.execution.ordered_step_ids) {
          const step = result.execution.steps[stepId];
          const dependencySuffix =
            step.status === "failed_dependency"
              ? ` [upstream=${step.upstream_step_id} missing=${step.missing_field_path}]`
              : "";
          console.log(`  ${step.step_id}: ${step.status}${step.error ? ` (${step.error})` : ""}${dependencySuffix}`);
        }
        console.log();
      }

      console.log("Summary:");
      console.log(result.response.summary);
      console.log();

      console.log("Claims:");
      for (const claim of result.response.claims) {
        console.log(
          `  [${claim.epistemic_class}] evidence=[${claim.evidence_span_ids.join(", ")}] text=${claim.text}`,
        );
        if (claim.reasoning) {
          console.log(`    reasoning: ${claim.reasoning}`);
        }
        if (claim.missing_data) {
          console.log(`    missing_data: ${claim.missing_data}`);
        }
        if (claim.suggested_action) {
          console.log(`    suggested_action: ${claim.suggested_action}`);
        }
      }
      console.log();

      console.log("Suggested actions:");
      for (const action of result.response.suggested_actions) {
        console.log(`  ${action.action_type}: ${action.label} ${JSON.stringify(action.context)}`);
      }
      console.log();
    } catch (error) {
      console.log("Pipeline error:");
      console.log(error instanceof Error ? error.message : error);
      console.log();
    }
  }
}

main().catch((error) => {
  console.error();
  console.error("=== QUERY SMOKE FAILED ===");
  console.error(error instanceof Error ? `Error: ${error.message}` : error);
  process.exit(1);
});
