import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-runtime-check";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-runtime-check";

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SANCTIONED_REFRESH_FILES = new Set([
  path.join(ROOT, "supabase/migrations/013_refresh_dash_views_ordered.sql"),
  path.join(ROOT, "supabase/seed.sql"),
]);

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
          return [];
        }
        return listFiles(fullPath);
      }
      return [fullPath];
    }),
  );

  return files.flat();
}

async function findDirectRefreshViolations() {
  const files = await listFiles(path.join(ROOT, "src"));
  const violations: string[] = [];

  for (const file of files) {
    const contents = await fs.readFile(file, "utf8");
    if (contents.includes("REFRESH MATERIALIZED VIEW") && !SANCTIONED_REFRESH_FILES.has(file)) {
      violations.push(path.relative(ROOT, file));
    }
  }

  return violations;
}

async function main() {
  const { getRuntimeInvariantReport } = await import("@/lib/runtime/invariants");
  const report = await getRuntimeInvariantReport({ force: true });
  const refreshViolations = await findDirectRefreshViolations();

  const allChecks = [
    ...report.checks.map((check) => ({
      name: check.name,
      ok: check.ok,
      remediation: check.remediation,
    })),
    {
      name: "refresh:no_direct_refresh_calls_in_src",
      ok: refreshViolations.length === 0,
      remediation:
        refreshViolations.length === 0
          ? "none"
          : `Remove direct REFRESH MATERIALIZED VIEW usage from: ${refreshViolations.join(", ")}`,
    },
  ];

  for (const check of allChecks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
    if (!check.ok) {
      console.log(`  remediation: ${check.remediation}`);
    }
  }

  if (allChecks.some((check) => !check.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
