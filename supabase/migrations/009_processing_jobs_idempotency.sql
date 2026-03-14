-- Milestone 3 | 009_processing_jobs_idempotency.sql
-- Adds idempotency_key to processing_jobs per §7.4
-- Key = sha256(artifact_id + extractor_version + normalized_payload_hash)

ALTER TABLE processing_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS processing_jobs_idempotency_key_uidx
  ON processing_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
