import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-for-compose-debug";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-for-compose-debug";

import { requestStructuredObjectWithRaw } from "@/lib/anthropic/client";
import { MODEL_ROUTING } from "@/lib/anthropic/models";
import { COMPOSE_SYSTEM_PROMPT, StructuredComposeSchema } from "@/lib/query/compose";
import { decomposeQuery } from "@/lib/query/decompose";
import { executeQueryPlan } from "@/lib/query/execute";
import { stableStringify } from "@/pipeline/utils";

const query = process.argv.slice(2).join(" ").trim() || "Where are my 6oz sample bottles?";

async function main() {
  console.log(`QUERY: ${query}`);
  console.log();

  const plan = await decomposeQuery(query);
  const execution = await executeQueryPlan(plan);

  const initial = await requestStructuredObjectWithRaw<unknown>({
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

  console.log("=== RAW COMPOSE TEXT ===");
  console.log(initial.rawText);
  console.log();

  if (initial.parsed === null) {
    console.log("=== JSON PARSE ERROR ===");
    console.log(initial.parseError);
    return;
  }

  console.log("=== PARSED OBJECT ===");
  console.log(JSON.stringify(initial.parsed, null, 2));
  console.log();

  const validation = StructuredComposeSchema.safeParse(initial.parsed);

  if (validation.success) {
    console.log("=== VALIDATION ===");
    console.log("PASS");
    return;
  }

  console.log("=== VALIDATION ERRORS ===");
  for (const issue of validation.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    console.log(`- path=${path} code=${issue.code} message=${issue.message}`);
  }
}

main().catch((error) => {
  console.error();
  console.error("=== COMPOSE DEBUG FAILED ===");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
