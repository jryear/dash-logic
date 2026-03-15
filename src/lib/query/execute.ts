// Traces to: ARCHITECTURE-dash.md §8.1-§8.2; README.md Query Intelligence

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { RPC_MANIFEST } from "@/lib/query/rpc-manifest";
import {
  QueryExecutionResultSchema,
  type AllowedRpc,
  type ExecutedStep,
  type QueryExecutionResult,
  type QueryPlan,
  type QueryStep,
} from "@/lib/query/types";

const PSEUDO_SQL_PATTERN = /\b(now\(\)|interval|select\b|::|date_trunc\b|current_date\b|current_timestamp\b)\b/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PlanValidationIssue = {
  step_id: string;
  error: string;
};

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

function validateLiteralArgs(args: Record<string, unknown>): boolean {
  for (const value of Object.values(args)) {
    if (typeof value === "string" && PSEUDO_SQL_PATTERN.test(value)) {
      return false;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (!validateLiteralArgs({ entry })) {
          return false;
        }
      }
    }

    if (value && typeof value === "object") {
      if (!validateLiteralArgs(value as Record<string, unknown>)) {
        return false;
      }
    }
  }

  return true;
}

function isValidArgValue(value: unknown, spec: (typeof RPC_MANIFEST)[AllowedRpc]["args"][string]) {
  if (value === null || value === undefined) {
    return spec.nullable;
  }

  switch (spec.type) {
    case "uuid":
      return typeof value === "string" && UUID_PATTERN.test(value);
    case "int":
      return typeof value === "number" && Number.isInteger(value);
    case "bigint_array":
      return (
        Array.isArray(value) &&
        value.every(
          (entry) =>
            (typeof entry === "number" && Number.isInteger(entry)) ||
            (typeof entry === "string" && /^\d+$/.test(entry)),
        )
      );
    case "text":
    case "tstzrange":
      return typeof value === "string";
    default:
      return true;
  }
}

function isFieldPathValid(rpc: AllowedRpc, fieldPath: string) {
  const manifest = RPC_MANIFEST[rpc];
  const segments = fieldPath.split(".").filter(Boolean);
  const first = segments[0];

  if (!first) {
    return false;
  }

  const fieldName = /^\d+$/.test(first) ? segments[1] : first;

  if (!fieldName) {
    return false;
  }

  return manifest.returns.includes(fieldName);
}

export function validateQueryPlan(plan: QueryPlan) {
  const issues: PlanValidationIssue[] = [];
  const stepById = new Map(plan.steps.map((step) => [step.step_id, step]));

  for (const step of plan.steps) {
    const manifest = RPC_MANIFEST[step.rpc];

    if (!validateLiteralArgs(step.args)) {
      issues.push({
        step_id: step.step_id,
        error: "Args contain pseudo-SQL or non-literal expressions.",
      });
    }

    for (const [argName, spec] of Object.entries(manifest.args)) {
      if (!Object.prototype.hasOwnProperty.call(step.args, argName)) {
        issues.push({
          step_id: step.step_id,
          error: `Missing required arg key: ${argName}`,
        });
        continue;
      }

      const value = step.args[argName];
      if ((value === null || value === undefined) && !spec.nullable) {
        const dependencySuppliesArg = step.required_from_dependency.some((mapping) => mapping.as === argName);
        if (!dependencySuppliesArg) {
          issues.push({
            step_id: step.step_id,
            error: `Arg ${argName} cannot be null for ${step.rpc}`,
          });
        }
      }

      if (value !== null && value !== undefined && !isValidArgValue(value, spec)) {
        issues.push({
          step_id: step.step_id,
          error: `Arg ${argName} has invalid ${spec.type} value`,
        });
      }

      if (spec.allowed_values && typeof value === "string" && !spec.allowed_values.includes(value)) {
        issues.push({
          step_id: step.step_id,
          error: `Arg ${argName} must be one of: ${spec.allowed_values.join(", ")}`,
        });
      }
    }

    for (const argName of Object.keys(step.args)) {
      if (!manifest.args[argName]) {
        issues.push({
          step_id: step.step_id,
          error: `Unexpected arg ${argName} for ${step.rpc}`,
        });
      }
    }

    for (const mapping of step.required_from_dependency) {
      const dependency = stepById.get(mapping.step_id);

      if (!dependency) {
        issues.push({
          step_id: step.step_id,
          error: `Unknown dependency step_id ${mapping.step_id}`,
        });
        continue;
      }

      if (!step.depends_on.includes(mapping.step_id)) {
        issues.push({
          step_id: step.step_id,
          error: `required_from_dependency references ${mapping.step_id} but depends_on does not include it`,
        });
      }

      if (!isFieldPathValid(dependency.rpc, mapping.field_path)) {
        issues.push({
          step_id: step.step_id,
          error: `Dependency field path ${mapping.field_path} is not valid for ${dependency.rpc}`,
        });
      }

      if (RPC_MANIFEST[dependency.rpc].returns_collection && !/^\d+\./.test(mapping.field_path)) {
        issues.push({
          step_id: step.step_id,
          error: `Dependency field path ${mapping.field_path} must use an indexed path for ${dependency.rpc}`,
        });
      }

      if (!manifest.args[mapping.as]) {
        issues.push({
          step_id: step.step_id,
          error: `Dependency mapping target arg ${mapping.as} is not valid for ${step.rpc}`,
        });
      }

      const targetSpec = manifest.args[mapping.as];
      if (
        step.rpc === "search_entities_fuzzy" &&
        mapping.as === "p_entity_type"
      ) {
        issues.push({
          step_id: step.step_id,
          error: "search_entities_fuzzy entity_type must be a literal allowed value, not dependency-bound",
        });
      }
    }

    if (
      step.rpc === "search_entities_fuzzy" &&
      typeof step.args.p_query === "string" &&
      /\bpo\s*#?\w+/i.test(step.args.p_query)
    ) {
      issues.push({
        step_id: step.step_id,
        error: "search_entities_fuzzy may not be used for PO lookup",
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
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

function bindArgsFromDependencies(step: QueryStep, results: Record<string, ExecutedStep>) {
  const boundArgs = { ...step.args };

  for (const mapping of step.required_from_dependency) {
    const upstream = results[mapping.step_id];

    if (!upstream || upstream.status !== "completed") {
      return {
        ok: false as const,
        upstream_step_id: mapping.step_id,
        missing_field_path: mapping.field_path,
        error: `Dependency ${mapping.step_id} did not complete successfully.`,
        args: boundArgs,
      };
    }

    const value = extractPathValue(upstream.data, mapping.field_path.split("."));
    const indexedPathMatch = mapping.field_path.match(/^(\d+)\./);
    const indexedOutOfRange =
      indexedPathMatch &&
      Array.isArray(upstream.data) &&
      Number.parseInt(indexedPathMatch[1], 10) >= upstream.data.length;
    const missing = value === undefined || value === null || (Array.isArray(value) && value.length === 0);

    if (indexedOutOfRange) {
      return {
        ok: false as const,
        fanout_clamped: true as const,
        upstream_step_id: mapping.step_id,
        missing_field_path: mapping.field_path,
        error: null,
        args: boundArgs,
      };
    }

    if (missing) {
      return {
        ok: false as const,
        fanout_clamped: false as const,
        upstream_step_id: mapping.step_id,
        missing_field_path: mapping.field_path,
        error: `Missing dependency field ${mapping.field_path} from ${mapping.step_id}.`,
        args: boundArgs,
      };
    }

    boundArgs[mapping.as] = value;
  }

  return {
    ok: true as const,
    args: boundArgs,
  };
}

export async function executeQueryPlan(plan: QueryPlan): Promise<QueryExecutionResult> {
  const preflight = validateQueryPlan(plan);

  if (!preflight.valid) {
    throw new Error(
      `planner_error: ${preflight.issues.map((issue) => `${issue.step_id}: ${issue.error}`).join("; ")}`,
    );
  }

  const levels = topologicalLevels(plan.steps);
  const results: Record<string, ExecutedStep> = {};
  const orderedStepIds: string[] = [];

  for (const level of levels) {
    const executions = level.map(async (step) => {
      orderedStepIds.push(step.step_id);

      const binding = bindArgsFromDependencies(step, results);
      if (!binding.ok) {
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: binding.args,
          status: binding.fanout_clamped ? "fanout_clamped" : "failed_dependency",
          data: null,
          error: binding.error,
          missing_field_path: binding.missing_field_path,
          upstream_step_id: binding.upstream_step_id,
        };
        return;
      }

      try {
        const data = await callRpc(step.rpc, binding.args);
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: binding.args,
          status: "completed",
          data,
          error: null,
          missing_field_path: null,
          upstream_step_id: null,
        };
      } catch (error) {
        results[step.step_id] = {
          step_id: step.step_id,
          rpc: step.rpc,
          args: binding.args,
          status: "failed",
          data: null,
          error: error instanceof Error ? error.message : "Unknown RPC error",
          missing_field_path: null,
          upstream_step_id: null,
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
