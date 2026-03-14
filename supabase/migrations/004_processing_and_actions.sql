-- Milestone 0 | 004_processing_and_actions.sql | Traces to: ARCHITECTURE-dash.md §6.1, §9.4

CREATE TABLE IF NOT EXISTS processing_jobs (
  job_id bigserial PRIMARY KEY,
  artifact_id bigint NOT NULL REFERENCES artifacts(artifact_id),
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  result jsonb NULL,
  error text NULL,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_status_idx
  ON processing_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS action_runs (
  action_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  commitment_id uuid NULL,
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  idempotency_key text NOT NULL,
  request_payload jsonb NOT NULL,
  provider_response jsonb NULL,
  provider_object_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS action_runs_idempotency_key_uidx
  ON action_runs (idempotency_key);

CREATE TABLE IF NOT EXISTS action_outbox (
  outbox_id bigserial PRIMARY KEY,
  action_run_id uuid NOT NULL REFERENCES action_runs(action_run_id),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_outbox_pending_idx
  ON action_outbox (status, available_at);
