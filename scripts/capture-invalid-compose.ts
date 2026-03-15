/**
 * Capture raw compose output and validation errors for one live query.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/capture-invalid-compose.ts "Where are my 6oz sample bottles?"
 */

import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-for-compose-capture";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-for-compose-capture";

async function main() {
  const query = process.argv.slice(2).join(" ").trim() || "Where are my 6oz sample bottles?";

  const { decomposeQuery } = await import("../src/lib/query/decompose");
  const { executeQueryPlan } = await import("../src/lib/query/execute");
  const { requestStructuredObjectWithRaw } = await import("../src/lib/anthropic/client");
  const { MODEL_ROUTING } = await import("../src/lib/anthropic/models");
  const { COMPOSE_SYSTEM_PROMPT, StructuredComposeSchema } = await import("../src/lib/query/compose");
  const { stableStringify } = await import("../src/pipeline/utils");

  console.log(`QUERY: ${query}`);
  console.log();

  const plan = await decomposeQuery(query);
  const execution = await executeQueryPlan(plan);

  const { rawText, parsed, parseError } = await requestStructuredObjectWithRaw({
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

  console.log("=== RAW TEXT ===");
  console.log(rawText);
  console.log();

  console.log("=== PARSE STATUS ===");
  if (parsed === null) {
    console.log(`JSON parse failed: ${parseError}`);
    return;
  }
  console.log("JSON parse succeeded");
  console.log();

  console.log("=== PARSED OBJECT ===");
  console.log(JSON.stringify(parsed, null, 2));
  console.log();

  const validation = StructuredComposeSchema.safeParse(parsed);
  console.log("=== STRUCTURED VALIDATION ===");
  if (validation.success) {
    console.log("StructuredComposeSchema: PASS");
    return;
  }

  console.log("StructuredComposeSchema: FAIL");
  for (const issue of validation.error.issues) {
    console.log(`- path=${issue.path.join(".")} code=${issue.code} message=${issue.message}`);
  }
}

main().catch((error) => {
  console.error();
  console.error("=== CAPTURE FAILED ===");
  console.error(error instanceof Error ? `Error: ${error.message}` : error);
  process.exit(1);
});
