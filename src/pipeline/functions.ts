// Traces to: ARCHITECTURE-dash.md §7.1-§7.4, README.md Inngest Job Map

import { DASH_EVENTS, inngest } from "@/lib/inngest/client";
import { logStageEvent, serializeError } from "@/lib/inngest/middleware";
import {
  ArtifactCommitmentsExtractedEventSchema,
  ArtifactClassifiedEventSchema,
  ArtifactEntitiesExtractedEventSchema,
  ArtifactEntitiesResolvedEventSchema,
  ArtifactReceivedEventSchema,
} from "@/pipeline/types";
import { runClassificationStage } from "@/pipeline/stages/classify";
import { runCommitmentExtractionStage } from "@/pipeline/stages/extract-commitments";
import { runEntityExtractionStage } from "@/pipeline/stages/extract-entities";
import { runEntityResolutionStage } from "@/pipeline/stages/resolve-entities";
import { runScoreAndEmitStage } from "@/pipeline/stages/score-and-emit";

export const classifyArtifactFunction = inngest.createFunction(
  { id: "extract-classify", retries: 2 },
  { event: DASH_EVENTS.artifactReceived },
  async ({ event }) => {
    const payload = ArtifactReceivedEventSchema.parse(event.data);
    logStageEvent("classify", payload.artifactId, "started");

    try {
      const result = await runClassificationStage(payload.artifactId);

      if (!result.skipped) {
        await inngest.send({
          name: DASH_EVENTS.artifactClassified,
          data: {
            artifactId: payload.artifactId,
            classification: result.output,
            extractor: result.extractor,
            idempotencyKey: result.idempotencyKey,
          },
        });
      }

      logStageEvent("classify", payload.artifactId, result.skipped ? "skipped" : "completed");

      return {
        stage: "classify",
        artifactId: payload.artifactId,
        skipped: result.skipped,
      };
    } catch (error) {
      logStageEvent("classify", payload.artifactId, "failed", serializeError(error));
      throw error;
    }
  },
);

export const extractEntitiesFunction = inngest.createFunction(
  { id: "extract-entities", retries: 2 },
  { event: DASH_EVENTS.artifactClassified },
  async ({ event }) => {
    const payload = ArtifactClassifiedEventSchema.parse(event.data);
    logStageEvent("extract_entities", payload.artifactId, "started");

    try {
      const result = await runEntityExtractionStage(payload.artifactId, payload.classification);

      if (!result.skipped) {
        await inngest.send({
          name: DASH_EVENTS.artifactEntitiesExtracted,
          data: {
            artifactId: payload.artifactId,
            classification: payload.classification,
            extraction: result.output,
            extractor: result.extractor,
            idempotencyKey: result.idempotencyKey,
          },
        });
      }

      logStageEvent("extract_entities", payload.artifactId, result.skipped ? "skipped" : "completed");

      return {
        stage: "extract_entities",
        artifactId: payload.artifactId,
        skipped: result.skipped,
      };
    } catch (error) {
      logStageEvent("extract_entities", payload.artifactId, "failed", serializeError(error));
      throw error;
    }
  },
);

export const resolveEntitiesFunction = inngest.createFunction(
  { id: "resolve-entities", retries: 2 },
  { event: DASH_EVENTS.artifactEntitiesExtracted },
  async ({ event }) => {
    const payload = ArtifactEntitiesExtractedEventSchema.parse(event.data);
    logStageEvent("resolve_entities", payload.artifactId, "started");

    try {
      const result = await runEntityResolutionStage(
        payload.artifactId,
        payload.classification,
        payload.extraction,
      );

      if (!result.skipped) {
        await inngest.send({
          name: DASH_EVENTS.artifactEntitiesResolved,
          data: {
            artifactId: payload.artifactId,
            classification: payload.classification,
            extraction: payload.extraction,
            resolution: result.output,
            extractor: result.extractor,
            idempotencyKey: result.idempotencyKey,
          },
        });
      }

      logStageEvent("resolve_entities", payload.artifactId, result.skipped ? "skipped" : "completed");

      return {
        stage: "resolve_entities",
        artifactId: payload.artifactId,
        skipped: result.skipped,
      };
    } catch (error) {
      logStageEvent("resolve_entities", payload.artifactId, "failed", serializeError(error));
      throw error;
    }
  },
);

export const extractCommitmentsFunction = inngest.createFunction(
  { id: "extract-commitments", retries: 2 },
  { event: DASH_EVENTS.artifactEntitiesResolved },
  async ({ event }) => {
    const payload = ArtifactEntitiesResolvedEventSchema.parse(event.data);
    logStageEvent("extract_commitments", payload.artifactId, "started");

    try {
      const result = await runCommitmentExtractionStage(payload);

      if (!result.skipped) {
        await inngest.send({
          name: DASH_EVENTS.artifactCommitmentsExtracted,
          data: {
            artifactId: payload.artifactId,
            classification: payload.classification,
            extraction: payload.extraction,
            resolution: payload.resolution,
            commitments: result.output,
            extractor: result.extractor,
            idempotencyKey: result.idempotencyKey,
          },
        });
      }

      logStageEvent(
        "extract_commitments",
        payload.artifactId,
        result.skipped ? "skipped" : "completed",
      );

      return {
        stage: "extract_commitments",
        artifactId: payload.artifactId,
        skipped: result.skipped,
      };
    } catch (error) {
      logStageEvent("extract_commitments", payload.artifactId, "failed", serializeError(error));
      throw error;
    }
  },
);

export const scoreAndEmitFunction = inngest.createFunction(
  { id: "score-and-emit", retries: 2 },
  { event: DASH_EVENTS.artifactCommitmentsExtracted },
  async ({ event }) => {
    const payload = ArtifactCommitmentsExtractedEventSchema.parse(event.data);
    logStageEvent("score_and_emit", payload.artifactId, "started");

    try {
      const result = await runScoreAndEmitStage(payload);

      if (!result.skipped && result.written.records.length > 0) {
        await inngest.send({
          name: DASH_EVENTS.ledgerEventsWritten,
          data: result.written,
        });
      }

      logStageEvent("score_and_emit", payload.artifactId, result.skipped ? "skipped" : "completed");

      return {
        stage: "score_and_emit",
        artifactId: payload.artifactId,
        skipped: result.skipped,
        written: result.written.records.length,
        candidatesStored: result.candidatesStored,
      };
    } catch (error) {
      logStageEvent("score_and_emit", payload.artifactId, "failed", serializeError(error));
      throw error;
    }
  },
);

export const pipelineFunctions = [
  classifyArtifactFunction,
  extractEntitiesFunction,
  resolveEntitiesFunction,
  extractCommitmentsFunction,
  scoreAndEmitFunction,
];
