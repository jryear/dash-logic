-- Milestone 0 | 005_constraints_and_indexes.sql | Traces to: ARCHITECTURE-dash.md §5.5, §6.1; README.md D-002

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commitment_events_payload_jsonschema_chk'
      AND conrelid = 'dash_private.commitment_events'::regclass
  ) THEN
    ALTER TABLE dash_private.commitment_events
      ADD CONSTRAINT commitment_events_payload_jsonschema_chk
      CHECK (
        CASE
          WHEN event_type = 'created' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "sku", "partner_id", "description"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "sku": { "type": "string" },
                  "partner_id": { "type": "string" },
                  "description": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'term_set' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "term_type", "value", "unit"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "term_type": { "type": "string" },
                  "value": {},
                  "unit": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'quantity_committed' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "quantity", "unit", "sku", "unit_price", "currency", "due_date"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "quantity": { "type": "number" },
                  "unit": { "type": "string" },
                  "sku": { "type": "string" },
                  "unit_price": { "type": "number" },
                  "currency": { "type": "string" },
                  "due_date": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'milestone_set' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "milestone_type", "date", "description"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "milestone_type": { "type": "string" },
                  "date": { "type": "string" },
                  "description": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'status_updated' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "from_status", "to_status", "reason"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "from_status": { "type": "string" },
                  "to_status": { "type": "string" },
                  "reason": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'amended' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "field", "old_value", "new_value", "reason"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "field": { "type": "string" },
                  "old_value": {},
                  "new_value": {},
                  "reason": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'cancelled' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "reason", "cancellation_terms"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "reason": { "type": "string" },
                  "cancellation_terms": {}
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'invoice_issued' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "invoice_number", "amount", "currency", "due_date", "line_items", "terms"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "invoice_number": { "type": "string" },
                  "amount": { "type": "number" },
                  "currency": { "type": "string" },
                  "due_date": { "type": "string" },
                  "line_items": { "type": "array" },
                  "terms": {}
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'payment_made' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "amount", "currency", "method", "reference_id"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "amount": { "type": "number" },
                  "currency": { "type": "string" },
                  "method": { "type": "string" },
                  "reference_id": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          ELSE false
        END
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fulfillment_events_payload_jsonschema_chk'
      AND conrelid = 'dash_private.fulfillment_events'::regclass
  ) THEN
    ALTER TABLE dash_private.fulfillment_events
      ADD CONSTRAINT fulfillment_events_payload_jsonschema_chk
      CHECK (
        CASE
          WHEN event_type = 'shipped' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "quantity": { "type": "number" },
                  "sku": { "type": "string" },
                  "tracking_number": { "type": "string" },
                  "carrier": { "type": "string" },
                  "location": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'received' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "quantity": { "type": "number" },
                  "sku": { "type": "string" },
                  "tracking_number": { "type": "string" },
                  "carrier": { "type": "string" },
                  "location": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'delivered' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "quantity": { "type": "number" },
                  "sku": { "type": "string" },
                  "tracking_number": { "type": "string" },
                  "carrier": { "type": "string" },
                  "location": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'partial_received' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "quantity": { "type": "number" },
                  "sku": { "type": "string" },
                  "tracking_number": { "type": "string" },
                  "carrier": { "type": "string" },
                  "location": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          WHEN event_type = 'returned' AND COALESCE(payload->>'schema_version', '') = 'v1' THEN
            extensions.jsonb_matches_schema(
              '{
                "type": "object",
                "required": ["schema_version", "quantity", "sku", "tracking_number", "carrier", "location"],
                "properties": {
                  "schema_version": { "const": "v1" },
                  "quantity": { "type": "number" },
                  "sku": { "type": "string" },
                  "tracking_number": { "type": "string" },
                  "carrier": { "type": "string" },
                  "location": { "type": "string" }
                },
                "additionalProperties": true
              }'::jsonb,
              payload
            )
          ELSE false
        END
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx
  ON contacts USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_role_idx
  ON contacts (role);
CREATE INDEX IF NOT EXISTS communications_date_idx
  ON communications (communication_date DESC);
CREATE INDEX IF NOT EXISTS communications_subject_trgm_idx
  ON communications USING GIN (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS communications_summary_fts_idx
  ON communications USING GIN (to_tsvector('english', COALESCE(summary, '')));
CREATE INDEX IF NOT EXISTS relationships_partner_status_idx
  ON relationships (partner_id, status);
CREATE INDEX IF NOT EXISTS processing_jobs_artifact_stage_idx
  ON processing_jobs (artifact_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS action_runs_commitment_idx
  ON action_runs (commitment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS action_outbox_action_run_idx
  ON action_outbox (action_run_id);
CREATE INDEX IF NOT EXISTS review_events_target_idx
  ON dash_private.review_events (target_table, target_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fulfillment_events_type_idx
  ON dash_private.fulfillment_events (event_type);
CREATE INDEX IF NOT EXISTS fulfillment_events_payload_gin
  ON dash_private.fulfillment_events USING GIN (payload);
