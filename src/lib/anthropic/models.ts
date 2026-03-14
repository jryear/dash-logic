// Traces to: README.md Milestone 3

export const MODEL_ROUTING = {
  classify: "claude-sonnet-4-6",
  extract_entities: "claude-sonnet-4-6",
  resolve_entities: null,
  extract_commitments: "claude-opus-4-6",
  score_and_emit: null,
  query_decompose: "claude-sonnet-4-6",
  query_compose: "claude-opus-4-6",
} as const;
