import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-debug-temporal";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-debug-temporal";

import { runQueryPipeline } from "@/lib/query/pipeline";

const question = process.argv.slice(2).join(" ").trim() || "What’s overdue with Pacific Packaging this week?";

const SAFE_PATTERN =
  /\b(reports|reported|no record(?:ed)?|based on available records|cannot confirm|can't confirm|timing is uncertain|no explicit date|approx(?:imation)?|likely|appears|may|suggests)\b/i;
const UNSAFE_PATTERN =
  /\b(as of\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)|on\s+\d{4}-\d{2}-\d{2}|on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}|was shipped on|arrived on|delivered on|confirmed on|over a year ago|more than a year ago)\b/i;

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

async function main() {
  const result = await runQueryPipeline(question);
  const textCorpus = [
    result.response.summary,
    ...result.response.claims.flatMap((claim) => [claim.text, claim.reasoning ?? "", claim.missing_data ?? ""]),
  ].join(" ");

  const timeUncertaintyPresent = containsTimeUncertainty(result.execution);
  const unsafeMatches = [...textCorpus.matchAll(new RegExp(UNSAFE_PATTERN.source, "ig"))].map((match) => match[0]);
  const safeMatches = [...textCorpus.matchAll(new RegExp(SAFE_PATTERN.source, "ig"))].map((match) => match[0]);

  console.log("QUESTION:", question);
  console.log();
  console.log("TIME_UNCERTAINTY_PRESENT:", timeUncertaintyPresent);
  console.log("TIME_UNCERTAINTY_UNSAFE:", timeUncertaintyPresent && unsafeMatches.length > 0);
  console.log("TIME_UNCERTAINTY_HAS_SAFE_LANGUAGE:", safeMatches.length > 0);
  console.log();
  console.log("UNSAFE_MATCHES:", unsafeMatches);
  console.log("SAFE_MATCHES:", safeMatches);
  console.log();
  console.log("TEXT_CORPUS:");
  console.log(textCorpus);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
