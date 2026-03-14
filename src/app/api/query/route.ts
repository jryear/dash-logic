// Traces to: ARCHITECTURE-dash.md §8.1-§8.4; README.md Milestone 5

import { NextResponse } from "next/server";

import { runQueryPipeline } from "@/lib/query/pipeline";
import { QueryRequestSchema } from "@/lib/query/types";

export async function POST(request: Request) {
  try {
    const body = QueryRequestSchema.parse(await request.json());
    const result = await runQueryPipeline(body.query);

    return NextResponse.json(result.response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown query error";

    return NextResponse.json(
      {
        claims: [
          {
            text: "I couldn't complete that lookup.",
            epistemic_class: "UNKNOWN",
            evidence_span_ids: [],
            reasoning: null,
            missing_data: message,
            suggested_action: "Try asking again with a supplier name, SKU, invoice, or shipment reference.",
          },
        ],
        summary:
          "I couldn't complete that lookup. Try asking about a specific supplier, order, shipment, invoice, or communication thread.",
        suggested_actions: [],
        query_intent: "out_of_scope",
        schema_version: "v1",
      },
      { status: 500 },
    );
  }
}
