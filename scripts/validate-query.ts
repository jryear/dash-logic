/**
 * Validation: canonical query "Where are my 6oz sample bottles?" through
 * the full decompose → execute → compose pipeline against live Supabase + Anthropic.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/validate-query.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-for-validation";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-for-validation";

async function main() {
  const { runQueryPipeline } = await import("../src/lib/query/pipeline");

  const query = "Where are my 6oz sample bottles?";

  console.log("=== Query Pipeline Validation ===");
  console.log(`Query: "${query}"`);
  console.log();

  const result = await runQueryPipeline(query);

  // --- Phase 1: Decompose ---
  console.log("=== Phase 1: Decompose (Sonnet) ===");
  console.log(`Intent: ${result.plan.intent}`);
  console.log(`Steps: ${result.plan.steps.length}`);
  for (const step of result.plan.steps) {
    console.log(`  ${step.step_id}: ${step.rpc}(${JSON.stringify(step.args)})`);
    if (step.depends_on.length > 0) {
      console.log(`    depends_on: [${step.depends_on.join(", ")}]`);
    }
  }
  console.log();

  // --- Phase 2: Execute ---
  console.log("=== Phase 2: Execute (RPCs) ===");
  if (result.execution) {
    for (const stepId of result.execution.ordered_step_ids) {
      const step = result.execution.steps[stepId];
      console.log(`  ${step.step_id}: ${step.rpc} → ${step.status}`);
      if (step.status === "completed" && step.data !== null) {
        const dataStr = JSON.stringify(step.data);
        console.log(`    data: ${dataStr.length > 200 ? dataStr.substring(0, 200) + "..." : dataStr}`);
      }
      if (step.error) {
        console.log(`    error: ${step.error}`);
      }
    }
  } else {
    console.log("  (no execution — out_of_scope)");
  }
  console.log();

  // --- Phase 3: Compose ---
  console.log("=== Phase 3: Compose (Opus) ===");
  console.log(`Summary: ${result.response.summary}`);
  console.log(`Intent: ${result.response.query_intent}`);
  console.log(`Claims: ${result.response.claims.length}`);
  console.log(`Suggested actions: ${result.response.suggested_actions.length}`);
  console.log(`Schema version: ${result.response.schema_version}`);
  if (result.validationError) {
    console.log(`Validation error: ${result.validationError}`);
  }
  console.log();

  for (const claim of result.response.claims) {
    console.log("--- Claim ---");
    console.log(`  text: ${claim.text}`);
    console.log(`  class: ${claim.epistemic_class}`);
    console.log(`  evidence_span_ids: [${claim.evidence_span_ids.join(", ")}]`);
    if (claim.reasoning) console.log(`  reasoning: ${claim.reasoning}`);
    if (claim.missing_data) console.log(`  missing_data: ${claim.missing_data}`);
    if (claim.suggested_action) console.log(`  suggested_action: ${claim.suggested_action}`);
    console.log();
  }

  for (const action of result.response.suggested_actions) {
    console.log("--- Suggested Action ---");
    console.log(`  type: ${action.action_type}`);
    console.log(`  label: ${action.label}`);
    console.log(`  context: ${JSON.stringify(action.context)}`);
    console.log();
  }

  // --- Validation checks ---
  console.log("=== VALIDATION SUMMARY ===");

  const decomposePass = result.plan.intent !== "out_of_scope" && result.plan.steps.length > 0;
  console.log(`Decompose: ${decomposePass ? "PASS" : "FAIL"} (intent: ${result.plan.intent}, ${result.plan.steps.length} steps)`);

  const executePass = result.execution !== null &&
    Object.values(result.execution.steps).some((s) => s.status === "completed");
  console.log(`Execute: ${executePass ? "PASS" : "FAIL"}`);

  const composePass = result.response.summary.length > 0 && result.response.schema_version === "v1";
  console.log(`Compose: ${composePass ? "PASS" : "FAIL"}`);

  const zodPass = result.validationError === null;
  console.log(`Zod validation: ${zodPass ? "PASS" : "FAIL"}${result.validationError ? ` (${result.validationError})` : ""}`);

  // Check banned phrases
  const { BANNED_RESPONSE_PHRASES } = await import("../src/lib/query/types");
  const summaryLower = result.response.summary.toLowerCase();
  const claimTexts = result.response.claims.map((c) => c.text.toLowerCase()).join(" ");
  const allText = `${summaryLower} ${claimTexts}`;
  const bannedFound = BANNED_RESPONSE_PHRASES.filter((p: string) => allText.includes(p));
  console.log(`Banned phrases: ${bannedFound.length === 0 ? "PASS" : `FAIL (found: ${bannedFound.join(", ")})`}`);

  // Check that the response mentions Pacific Packaging or sample bottles
  const mentionsRelevant = allText.includes("pacific") || allText.includes("sample") || allText.includes("bottle") || allText.includes("4412");
  console.log(`Relevance: ${mentionsRelevant ? "PASS" : "FAIL"} (should mention Pacific Packaging, sample bottles, or PO 4412)`);
}

main().catch((error) => {
  console.error();
  console.error("=== QUERY VALIDATION FAILED ===");
  console.error(error instanceof Error ? `Error: ${error.message}` : error);
  process.exit(1);
});
