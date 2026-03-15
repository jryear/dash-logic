import { NextResponse } from "next/server";

import { getRuntimeInvariantReport } from "@/lib/runtime/invariants";

export async function GET() {
  try {
    const report = await getRuntimeInvariantReport({ force: true });

    return NextResponse.json(report, {
      status: report.ok ? 200 : report.critical_ok ? 200 : 503,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown health check failure";

    return NextResponse.json(
      {
        ok: false,
        critical_ok: false,
        checks: [],
        error: message,
      },
      { status: 503 },
    );
  }
}
