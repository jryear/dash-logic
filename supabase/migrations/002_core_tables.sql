-- Milestone 0 | 002_core_tables.sql | Traces to: ARCHITECTURE-dash.md §6.1

CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id bigserial PRIMARY KEY,
  source_system text NOT NULL,
  source_locator text NOT NULL,
  source_revision text NULL,
  content_sha256 bytea NOT NULL,
  mime_type text NOT NULL,
  storage_uri text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_source_revision_uidx
  ON artifacts (source_system, source_locator, COALESCE(source_revision, ''));
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_content_sha256_uidx
  ON artifacts (content_sha256);
CREATE INDEX IF NOT EXISTS artifacts_source_idx
  ON artifacts (source_system, source_locator);

CREATE TABLE IF NOT EXISTS evidence_spans (
  evidence_span_id bigserial PRIMARY KEY,
  artifact_id bigint NOT NULL REFERENCES artifacts(artifact_id),
  locator jsonb NOT NULL,
  extracted_text text NOT NULL,
  snippet_sha256 bytea NOT NULL,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', extracted_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_spans_artifact_snippet_uidx
  ON evidence_spans (artifact_id, snippet_sha256);
CREATE INDEX IF NOT EXISTS evidence_spans_fts_idx
  ON evidence_spans USING GIN (fts);

CREATE TABLE IF NOT EXISTS partners (
  partner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  domain text NULL,
  partner_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_domain_idx
  ON partners (domain);
CREATE INDEX IF NOT EXISTS partners_normalized_idx
  ON partners (normalized_name);
CREATE INDEX IF NOT EXISTS partners_name_trgm_idx
  ON partners USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS contacts (
  contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(partner_id),
  name text NOT NULL,
  email text NULL,
  phone text NULL,
  role text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_email_idx
  ON contacts (email);

CREATE TABLE IF NOT EXISTS skus (
  sku_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  variants text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skus_normalized_idx
  ON skus (normalized_name);
CREATE INDEX IF NOT EXISTS skus_variants_idx
  ON skus USING GIN (variants);
CREATE INDEX IF NOT EXISTS skus_name_trgm_idx
  ON skus USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS relationships (
  relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(partner_id),
  status text NOT NULL DEFAULT 'active',
  negotiated_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_evidence bigint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communications (
  communication_id bigserial PRIMARY KEY,
  artifact_id bigint NOT NULL REFERENCES artifacts(artifact_id),
  relationship_id uuid REFERENCES relationships(relationship_id),
  contact_id uuid REFERENCES contacts(contact_id),
  direction text NOT NULL,
  subject text NULL,
  summary text NULL,
  communication_date timestamptz NOT NULL,
  thread_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS communications_relationship_idx
  ON communications (relationship_id, communication_date DESC);
CREATE INDEX IF NOT EXISTS communications_thread_idx
  ON communications (thread_id);
