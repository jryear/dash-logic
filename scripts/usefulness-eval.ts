import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-usefulness-eval";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-usefulness-eval";

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";

import { z } from "zod";

import { ensureRuntimeInvariants } from "@/lib/runtime/invariants";
import { runQueryPipeline } from "@/lib/query/pipeline";
import { BANNED_RESPONSE_PHRASES, QueryResponseSchema } from "@/lib/query/types";

const QuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
});

const QuestionSetSchema = z.array(QuestionSchema);

const FailureClassSchema = z.enum([
  "evidence_gap",
  "entity_resolution",
  "temporal_reasoning",
  "reconciliation",
  "comms_context",
  "language_ux",
  "external_model_failure",
  "planner_dependency",
]);

const VerdictSchema = z.enum(["usable", "partial", "wrong"]);

const EvalDetailSchema = z.object({
  question_id: z.string(),
  question: z.string(),
  schema_valid: z.boolean(),
  banned_phrase_leak: z.boolean(),
  unsupported_fact: z.boolean(),
  time_uncertainty_present: z.boolean(),
  time_uncertainty_safe: z.boolean(),
  time_uncertainty_reason: z.enum([
    "none",
    "safe_cautious_language",
    "unsafe_definitive_with_uncertain_flag",
    "cautious_but_awkward",
  ]),
  validation_error: z.string().nullable(),
  verdict: VerdictSchema,
  trust_critical_fail: z.boolean(),
  failure_class: FailureClassSchema.nullable(),
  latency_ms: z.number().int().nonnegative(),
  retry_count: z.number().int().nonnegative(),
  notes: z.string(),
  plan_intent: z.string().nullable(),
  planner_or_dependency_errors: z.array(z.string()),
  response: z.unknown().nullable(),
});

const EvalSummarySchema = z.object({
  git_sha: z.string(),
  model_versions: z.object({
    query_decompose: z.string(),
    query_compose: z.string(),
  }),
  timestamp: z.string(),
  dataset_tag: z.string(),
  total_questions: z.number().int().positive(),
  total_usable: z.number().int().nonnegative(),
  total_partial: z.number().int().nonnegative(),
  total_wrong: z.number().int().nonnegative(),
  trust_critical_count: z.number().int().nonnegative(),
  schema_valid_count: z.number().int().nonnegative(),
  gate_pass: z.boolean(),
  top_failure_classes: z.array(
    z.object({
      failure_class: FailureClassSchema,
      count: z.number().int().positive(),
    }),
  ),
  canonical_6oz_usable: z.boolean(),
  canonical_6oz_time_uncertainty_safe: z.boolean(),
});

type EvalDetail = z.infer<typeof EvalDetailSchema>;

const TIME_UNCERTAINTY_SAFE_PATTERN =
  /\b(reports|reported|no record(?:ed)?|based on available records|cannot confirm|can't confirm|timing is uncertain|no explicit date|approx(?:imation)?|likely|appears|may|suggests)\b/i;
const TIME_UNCERTAINTY_UNSAFE_PATTERN =
  /\b(as of\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)|on\s+\d{4}-\d{2}-\d{2}|on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}|was shipped on|arrived on|delivered on|confirmed on)\b/i;

function containsBannedPhrase(input: string) {
  const normalized = input.toLowerCase();
  return BANNED_RESPONSE_PHRASES.some((phrase) => normalized.includes(phrase));
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

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

function collectExecutionErrors(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const execution = value as {
    ordered_step_ids?: string[];
    steps?: Record<
      string,
      { error?: string | null; status?: string; upstream_step_id?: string | null; missing_field_path?: string | null }
    >;
  };

  const stepIds = execution.ordered_step_ids ?? Object.keys(execution.steps ?? {});
  const errors: string[] = [];

  for (const stepId of stepIds) {
    const step = execution.steps?.[stepId];
    if (!step) continue;
    if (step.error) {
      const suffix =
        step.status === "failed_dependency"
          ? ` [upstream=${step.upstream_step_id ?? "unknown"} missing=${step.missing_field_path ?? "unknown"}]`
          : "";
      errors.push(`${stepId}: ${step.error}${suffix}`);
    }
  }

  return errors;
}

function classifyFailure(detail: {
  banned_phrase_leak: boolean;
  unsupported_fact: boolean;
  schema_valid: boolean;
  time_uncertainty_safe: boolean;
  planner_or_dependency_errors: string[];
  validation_error: string | null;
  question: string;
  notesHint: string;
}) {
  if (/Internal server error|api_error/i.test(detail.notesHint)) {
    return "external_model_failure" as const;
  }
  if (detail.banned_phrase_leak) {
    return "language_ux" as const;
  }
  if (detail.unsupported_fact) {
    return "evidence_gap" as const;
  }
  if (!detail.time_uncertainty_safe) {
    return "temporal_reasoning" as const;
  }
  if (detail.planner_or_dependency_errors.length > 0) {
    return "planner_dependency" as const;
  }
  if (/shortfall|invoice|mismatch|reconciliation/i.test(detail.question)) {
    return "reconciliation" as const;
  }
  if (/silent|respond|follow-up|communication|email|thread/i.test(detail.question)) {
    return "comms_context" as const;
  }
  if (/po #|po\s/i.test(detail.question)) {
    return "entity_resolution" as const;
  }
  if (detail.validation_error) {
    return "language_ux" as const;
  }
  return null;
}

function deriveVerdict(params: {
  schema_valid: boolean;
  trust_critical_fail: boolean;
  planner_or_dependency_errors: string[];
  validation_error: string | null;
  notesHint: string;
}) {
  if (/Internal server error|api_error/i.test(params.notesHint)) {
    return "wrong" as const;
  }
  if (!params.schema_valid || params.trust_critical_fail) {
    return "wrong" as const;
  }
  if (params.planner_or_dependency_errors.length > 0 || params.validation_error) {
    return "partial" as const;
  }
  return "usable" as const;
}

async function retryOnce<T>(fn: () => Promise<T>) {
  try {
    return { value: await fn(), retryCount: 0, error: null };
  } catch (error) {
    const firstMessage = error instanceof Error ? error.message : String(error);
    if (!/Internal server error|api_error/i.test(firstMessage)) {
      return { value: null as T | null, retryCount: 0, error: firstMessage };
    }

    try {
      return { value: await fn(), retryCount: 1, error: null };
    } catch (retryError) {
      return {
        value: null as T | null,
        retryCount: 1,
        error: retryError instanceof Error ? retryError.message : String(retryError),
      };
    }
  }
}

async function loadQuestionSet() {
  const filePath = path.join(process.cwd(), "scripts", "usefulness-question-set.json");
  const raw = await fs.readFile(filePath, "utf8");
  return QuestionSetSchema.parse(JSON.parse(raw));
}

async function getGitSha() {
  return await new Promise<string>((resolve) => {
    exec("git rev-parse --short HEAD", { cwd: process.cwd() }, (error, stdout) => {
      if (error) {
        resolve("unknown");
        return;
      }
      resolve(stdout.trim() || "unknown");
    });
  });
}

async function evaluateQuestion(questionId: string, question: string): Promise<EvalDetail> {
  const startedAt = Date.now();
  const run = await retryOnce(() => runQueryPipeline(question));
  const latencyMs = Date.now() - startedAt;

  if (!run.value) {
    const failureClass = classifyFailure({
      banned_phrase_leak: false,
      unsupported_fact: false,
      schema_valid: false,
      time_uncertainty_safe: false,
      planner_or_dependency_errors: [],
      validation_error: run.error,
      question,
      notesHint: run.error ?? "",
    });

    return EvalDetailSchema.parse({
      question_id: questionId,
      question,
      schema_valid: false,
      banned_phrase_leak: false,
      unsupported_fact: false,
      time_uncertainty_present: false,
      time_uncertainty_safe: false,
      time_uncertainty_reason: "none",
      validation_error: run.error,
      verdict: "wrong",
      trust_critical_fail: true,
      failure_class: failureClass,
      latency_ms: latencyMs,
      retry_count: run.retryCount,
      notes: run.error ?? "Query failed before a response was returned.",
      plan_intent: null,
      planner_or_dependency_errors: [],
      response: null,
    });
  }

  const responseResult = QueryResponseSchema.safeParse(run.value.response);
  const textCorpus = [run.value.response.summary, ...run.value.response.claims.flatMap((claim) => [claim.text, claim.reasoning ?? "", claim.missing_data ?? ""])].join(
    " ",
  );

  const bannedPhraseLeak = containsBannedPhrase(textCorpus);
  const unsupportedFact = run.value.response.claims.some(
    (claim) => claim.epistemic_class === "FACT" && claim.evidence_span_ids.length === 0,
  );
  const timeUncertaintyPresent = containsTimeUncertainty(run.value.execution);
  const timeUncertaintyUnsafe = timeUncertaintyPresent && TIME_UNCERTAINTY_UNSAFE_PATTERN.test(textCorpus);
  const timeUncertaintyHasSafeLanguage = TIME_UNCERTAINTY_SAFE_PATTERN.test(textCorpus);
  const timeUncertaintySafe = !timeUncertaintyPresent || (!timeUncertaintyUnsafe && timeUncertaintyHasSafeLanguage);
  const timeUncertaintyReason = !timeUncertaintyPresent
    ? "none"
    : timeUncertaintyUnsafe
      ? "unsafe_definitive_with_uncertain_flag"
      : timeUncertaintyHasSafeLanguage
        ? "safe_cautious_language"
        : "cautious_but_awkward";
  const plannerOrDependencyErrors = collectExecutionErrors(run.value.execution);
  const trustCriticalFail = !responseResult.success || bannedPhraseLeak || unsupportedFact || !timeUncertaintySafe;
  const notesHint =
    run.value.validationError ??
    plannerOrDependencyErrors[0] ??
    (trustCriticalFail ? "One or more trust-critical checks failed." : "Automatic checks passed.");
  const failureClass = classifyFailure({
    banned_phrase_leak: bannedPhraseLeak,
    unsupported_fact: unsupportedFact,
    schema_valid: responseResult.success,
    time_uncertainty_safe: timeUncertaintySafe,
    planner_or_dependency_errors: plannerOrDependencyErrors,
    validation_error: run.value.validationError,
    question,
    notesHint,
  });
  const verdict = deriveVerdict({
    schema_valid: responseResult.success,
    trust_critical_fail: trustCriticalFail,
    planner_or_dependency_errors: plannerOrDependencyErrors,
    validation_error: run.value.validationError,
    notesHint,
  });

  return EvalDetailSchema.parse({
    question_id: questionId,
    question,
    schema_valid: responseResult.success,
    banned_phrase_leak: bannedPhraseLeak,
    unsupported_fact: unsupportedFact,
    time_uncertainty_present: timeUncertaintyPresent,
    time_uncertainty_safe: timeUncertaintySafe,
    time_uncertainty_reason: timeUncertaintyReason,
    validation_error: run.value.validationError,
    verdict,
    trust_critical_fail: trustCriticalFail,
    failure_class: failureClass,
    latency_ms: latencyMs,
    retry_count: run.retryCount,
    notes: notesHint,
    plan_intent: run.value.plan.intent,
    planner_or_dependency_errors: plannerOrDependencyErrors,
    response: run.value.response,
  });
}

function buildSummary(details: EvalDetail[], metadata: { gitSha: string; timestamp: string; datasetTag: string }) {
  const totalUsable = details.filter((detail) => detail.verdict === "usable").length;
  const totalPartial = details.filter((detail) => detail.verdict === "partial").length;
  const totalWrong = details.filter((detail) => detail.verdict === "wrong").length;
  const trustCriticalCount = details.filter((detail) => detail.trust_critical_fail).length;
  const schemaValidCount = details.filter((detail) => detail.schema_valid).length;
  const failureCounts = new Map<string, number>();

  for (const detail of details) {
    if (!detail.failure_class) continue;
    failureCounts.set(detail.failure_class, (failureCounts.get(detail.failure_class) ?? 0) + 1);
  }

  const topFailureClasses = [...failureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([failureClass, count]) => ({ failure_class: failureClass, count }));

  const canonical6oz = details.find((detail) => detail.question_id === "q01");
  const gatePass =
    totalUsable >= 8 &&
    trustCriticalCount === 0 &&
    schemaValidCount >= 9 &&
    canonical6oz?.verdict === "usable";

  return EvalSummarySchema.parse({
    git_sha: metadata.gitSha,
    model_versions: {
      query_decompose: "claude-sonnet-4-6",
      query_compose: "claude-opus-4-6",
    },
    timestamp: metadata.timestamp,
    dataset_tag: metadata.datasetTag,
    total_questions: details.length,
    total_usable: totalUsable,
    total_partial: totalPartial,
    total_wrong: totalWrong,
    trust_critical_count: trustCriticalCount,
    schema_valid_count: schemaValidCount,
    gate_pass: gatePass,
    top_failure_classes: topFailureClasses,
    canonical_6oz_usable: canonical6oz?.verdict === "usable",
    canonical_6oz_time_uncertainty_safe: canonical6oz?.time_uncertainty_safe ?? false,
  });
}

function renderHumanReview(summary: z.infer<typeof EvalSummarySchema>, details: EvalDetail[]) {
  const lines = [
    "# Usefulness Eval",
    "",
    `- Git SHA: ${summary.git_sha}`,
    `- Timestamp: ${summary.timestamp}`,
    `- Dataset tag: ${summary.dataset_tag}`,
    `- Gate pass: ${summary.gate_pass ? "yes" : "no"}`,
    `- Usable / Partial / Wrong: ${summary.total_usable} / ${summary.total_partial} / ${summary.total_wrong}`,
    `- Trust-critical failures: ${summary.trust_critical_count}`,
    `- Schema-valid responses: ${summary.schema_valid_count}/${summary.total_questions}`,
    "",
    "## Question Results",
    "",
    "| ID | Verdict | Trust Critical | Failure Class | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...details.map(
      (detail) =>
        `| ${detail.question_id} | ${detail.verdict} | ${detail.trust_critical_fail ? "yes" : "no"} | ${detail.failure_class ?? "-"} | ${detail.notes.replace(/\|/g, "/")} |`,
    ),
    "",
    "## Top Failure Classes",
    "",
    ...(summary.top_failure_classes.length > 0
      ? summary.top_failure_classes.map((item) => `- ${item.failure_class}: ${item.count}`)
      : ["- none"]),
  ];

  return lines.join("\n");
}

async function writeArtifacts(summary: z.infer<typeof EvalSummarySchema>, details: EvalDetail[]) {
  const outputDir = path.join(process.cwd(), "artifacts", "usefulness", summary.timestamp.replace(/[:.]/g, "-"));
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "eval-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(
    path.join(outputDir, "eval-details.jsonl"),
    `${details.map((detail) => JSON.stringify(detail)).join("\n")}\n`,
  );
  await fs.writeFile(path.join(outputDir, "eval-human-review.md"), `${renderHumanReview(summary, details)}\n`);

  return outputDir;
}

async function main() {
  await ensureRuntimeInvariants();

  const questions = await loadQuestionSet();
  const timestamp = new Date().toISOString();
  const gitSha = await getGitSha();
  const datasetTag = process.env.USEFULNESS_DATASET_TAG ?? "seed-live";

  const details: EvalDetail[] = [];
  for (const question of questions) {
    console.log(`Running ${question.id}: ${question.question}`);
    details.push(await evaluateQuestion(question.id, question.question));
  }

  const summary = buildSummary(details, { gitSha, timestamp, datasetTag });
  const outputDir = await writeArtifacts(summary, details);

  console.log();
  console.log(`Gate pass: ${summary.gate_pass ? "yes" : "no"}`);
  console.log(`Usable / Partial / Wrong: ${summary.total_usable} / ${summary.total_partial} / ${summary.total_wrong}`);
  console.log(`Trust-critical failures: ${summary.trust_critical_count}`);
  console.log(`Schema-valid responses: ${summary.schema_valid_count}/${summary.total_questions}`);
  console.log(`Artifacts: ${outputDir}`);

  if (!summary.gate_pass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
