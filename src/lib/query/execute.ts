// Traces to: ARCHITECTURE-dash.md §8.1-§8.2; README.md Query Intelligence

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  QueryExecutionResultSchema,
  type AllowedRpc,
  type ExecutedStep,
  type QueryExecutionResult,
  type QueryPlan,
  type QueryStep,
} from "@/lib/query/types";

const ALLOWLIST = new Set<AllowedRpc>([
  "resolve_supplier",
  "resolve_sku",
  "get_commitment_status",
  "list_open_commitments",
  "get_reconciliation_deltas",
  "get_recent_communications",
  "get_fulfillment_state",
  "get_payment_obligations",
  "get_evidence_for_claim",
  "search_evidence_text",
  "search_entities_fuzzy",
]);

function isPlaceholder(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("$");
}

function extractPathValue(source: unknown, path: string[]) {
  let current = source;

  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

function substituteValue(value: unknown, results: Record<string, ExecutedStep>): { value: unknown; missing: boolean } {
  if (isPlaceholder(value)) {
    const [, reference] = value.split("$");
    const parts = reference.split(".");
    const stepId = parts.shift();

    if (!stepId) {
      return { value: null, missing: true };
    }

    const step = results[stepId];
    if (!step || step.status !== "completed") {
      return { value: null, missing: true };
    }

    const resolved = extractPathValue(step.data, parts);
    const missing =
      resolved === undefined ||
      resolved === null ||
      (Array.isArray(resolved) && resolved.length === 0);

    return { value: resolved ?? null, missing };
  }

  if (Array.isArray(value)) {
    const resolvedEntries = value.map((entry) => substituteValue(entry, results));
    return {
      value: resolvedEntries.map((entry) => entry.value),
      missing: resolvedEntries.some((entry) => entry.missing),
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entryValue]) => [key, substituteValue(entryValue, results)] as const);
    return {
      value: Object.fromEntries(entries.map(([key, entry]) => [key, entry.value])),
      missing: entries.some(([, entry]) => entry.missing),
    };
  }

  return { value, missing: false };
}

function topologicalLevels(steps: QueryStep[]) {
  const byId = new Map(steps.map((step) => [step.step_id, step]));
  const remaining = new Set(steps.map((step) => step.step_id));
  const satisfied = new Set<string>();
  const levels: QueryStep[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((stepId) => byId.get(stepId))
      .filter((step): step is QueryStep => Boolean(step))
      .filter((step) => step.depends_on.every((dependency) => satisfied.has(dependency)));

    if (ready.length === 0) {
      throw new Error("Query plan has circular or missing dependencies.");
    }

    levels.push(ready);

    for (const step of ready) {
      satisfied.add(step.step_id);
      remaining.delete(step.step_id);
    }
  }

  return levels;
}

async function callRpc(rpc: AllowedRpc, args: Record<string, unknown>) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(rpc, args);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function executeQueryPlan(plan: QueryPlan): Promise<QueryExecutionResult> {
  const levels = topologicalLevels(plan.steps);
  const results: Record<string, ExecutedStep> = {};
  const orderedStepIds: string[] = [];

  for (const level of levels) {
    const executions = level.map(async (step) => {
      orderedStepIds.push(step.step_id);

      if (!ALLOWLIST.has(step.rpc)) {
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: step.args,
          status: "failed",
          data: null,
          error: `RPC ${step.rpc} is not allowlisted.`,
        };
        return;
      }

      const substituted = substituteValue(step.args, results);
      if (substituted.missing) {
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: substituted.value as Record<string, unknown>,
          status: "skipped",
          data: null,
          error: "Skipped because a dependency returned no usable value.",
        };
        return;
      }

      try {
        const data = await callRpc(step.rpc, substituted.value as Record<string, unknown>);
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: substituted.value as Record<string, unknown>,
          status: "completed",
          data,
          error: null,
        };
      } catch (error) {
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: substituted.value as Record<string, unknown>,
          status: "failed",
          data: null,
          error: error instanceof Error ? error.message : "Unknown RPC error",
        };
      }
    });

    await Promise.all(executions);
  }

  return QueryExecutionResultSchema.parse({
    steps: results,
    ordered_step_ids: orderedStepIds,
  });
}
