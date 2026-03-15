import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type InvariantCheck = {
  name: string;
  ok: boolean;
  critical: boolean;
  remediation: string;
};

type InvariantReport = {
  ok: boolean;
  critical_ok: boolean;
  checks: InvariantCheck[];
};

let cachedRuntimeInvariantPromise: Promise<InvariantReport> | null = null;

async function callInvariantRpc() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, params?: Record<string, never>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("assert_dash_runtime_invariants", {});

  if (error) {
    throw new Error(`Runtime invariant RPC failed: ${error.message}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Runtime invariant RPC returned an invalid payload.");
  }

  return data as InvariantReport;
}

export async function getRuntimeInvariantReport({ force = false }: { force?: boolean } = {}) {
  if (force || !cachedRuntimeInvariantPromise) {
    cachedRuntimeInvariantPromise = callInvariantRpc();
  }

  return cachedRuntimeInvariantPromise;
}

export async function ensureRuntimeInvariants() {
  const report = await getRuntimeInvariantReport();
  const failedChecks = report.checks.filter((check) => !check.ok);

  if (failedChecks.length === 0) {
    return report;
  }

  const summary = failedChecks.map((check) => `${check.name}: ${check.remediation}`).join("; ");
  const criticalFailures = failedChecks.filter((check) => check.critical);
  const shouldThrow = process.env.NODE_ENV !== "production" || criticalFailures.length > 0;

  if (shouldThrow) {
    throw new Error(`Dash runtime invariant failure: ${summary}`);
  }

  console.error("Dash runtime invariant warning:", summary);
  return report;
}
