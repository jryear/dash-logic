// Traces to: ARCHITECTURE-dash.md §7.1-§7.4

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : JSON.stringify(error),
    stack: null,
  };
}

export function logStageEvent(stage: string, artifactId: number, message: string, meta?: unknown) {
  console.info(`[pipeline:${stage}] artifact=${artifactId} ${message}`, meta ?? "");
}
