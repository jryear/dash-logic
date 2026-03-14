// Traces to: README.md Milestone 3

import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { pipelineFunctions } from "@/pipeline/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: pipelineFunctions,
});
