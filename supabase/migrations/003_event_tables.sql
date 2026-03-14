-- Milestone 0 | 003_event_tables.sql | Traces to: ARCHITECTURE-dash.md §6.1, §5.5

CREATE SCHEMA IF NOT EXISTS dash_private;

CREATE TABLE IF NOT EXISTS dash_private.commitment_events (
  event_id bigserial PRIMARY KEY,
  commitment_id uuid NOT NULL,
  seq integer NOT NULL,
  event_type text NOT NULL,
  event_time timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  relationship_id uuid NOT NULL REFERENCES public.relationships(relationship_id),
  payload jsonb NOT NULL,
  evidence_span_ids bigint[] NOT NULL DEFAULT '{}',
  extractor jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence double precision NULL,
  epistemic_class text NOT NULL DEFAULT 'FACT_CANDIDATE',
  idempotency_key text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS commitment_events_commitment_seq_uidx
  ON dash_private.commitment_events (commitment_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS commitment_events_idempotency_key_uidx
  ON dash_private.commitment_events (idempotency_key);
CREATE INDEX IF NOT EXISTS commitment_events_stream_idx
  ON dash_private.commitment_events (commitment_id, seq DESC);
CREATE INDEX IF NOT EXISTS commitment_events_time_idx
  ON dash_private.commitment_events (event_time DESC);
CREATE INDEX IF NOT EXISTS commitment_events_relationship_idx
  ON dash_private.commitment_events (relationship_id);
CREATE INDEX IF NOT EXISTS commitment_events_type_idx
  ON dash_private.commitment_events (event_type);
CREATE INDEX IF NOT EXISTS commitment_events_payload_gin
  ON dash_private.commitment_events USING GIN (payload);

CREATE TABLE IF NOT EXISTS dash_private.fulfillment_events (
  event_id bigserial PRIMARY KEY,
  commitment_id uuid NOT NULL,
  seq integer NOT NULL,
  event_type text NOT NULL,
  event_time timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  evidence_span_ids bigint[] NOT NULL DEFAULT '{}',
  extractor jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence double precision NULL,
  idempotency_key text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_events_commitment_seq_uidx
  ON dash_private.fulfillment_events (commitment_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_events_idempotency_key_uidx
  ON dash_private.fulfillment_events (idempotency_key);
CREATE INDEX IF NOT EXISTS fulfillment_events_stream_idx
  ON dash_private.fulfillment_events (commitment_id, seq DESC);
CREATE INDEX IF NOT EXISTS fulfillment_events_time_idx
  ON dash_private.fulfillment_events (event_time DESC);

CREATE TABLE IF NOT EXISTS dash_private.review_events (
  event_id bigserial PRIMARY KEY,
  target_event_id bigint NOT NULL,
  target_table text NOT NULL,
  decision text NOT NULL,
  reviewer text NOT NULL,
  notes text NULL,
  corrections jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
