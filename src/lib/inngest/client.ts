// Traces to: ARCHITECTURE-dash.md §7.1, README.md Inngest Job Map

import { Inngest } from "inngest";

import { env } from "@/lib/env";

export const DASH_EVENTS = {
  artifactReceived: "artifact.received",
  artifactClassified: "artifact.classified",
  artifactEntitiesExtracted: "artifact.entities_extracted",
  artifactEntitiesResolved: "artifact.entities_resolved",
  artifactCommitmentsExtracted: "artifact.commitments_extracted",
  ledgerEventsWritten: "ledger.events_written",
} as const;

export const inngest = new Inngest({
  id: "dash",
  eventKey: env.INNGEST_EVENT_KEY,
});
