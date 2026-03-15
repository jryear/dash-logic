// Traces to: README.md Milestone 3

import type { NextRequest } from "next/server";
import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { ensureRuntimeInvariants } from "@/lib/runtime/invariants";
import { pipelineFunctions } from "@/pipeline/functions";

const handlers = serve({
  client: inngest,
  functions: pipelineFunctions,
});

export async function GET(request: NextRequest, context: unknown) {
  await ensureRuntimeInvariants();
  return handlers.GET(request, context);
}

export async function POST(request: NextRequest, context: unknown) {
  await ensureRuntimeInvariants();
  return handlers.POST(request, context);
}

export async function PUT(request: NextRequest, context: unknown) {
  await ensureRuntimeInvariants();
  return handlers.PUT(request, context);
}
