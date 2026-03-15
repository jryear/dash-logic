-- Milestone 2 | 008_rpc_allowlist.sql | Traces to: ARCHITECTURE-dash.md §8.2

CREATE OR REPLACE FUNCTION public.resolve_supplier(
  p_name text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH threshold_config AS (
    SELECT COALESCE(NULLIF(current_setting('dash.trgm_threshold', true), ''), '0.3')::real AS threshold_value
  ),
  ranked AS (
    SELECT
      p.partner_id,
      p.name,
      p.normalized_name,
      p.domain,
      p.partner_type,
      similarity(p.name, p_name) AS similarity_score
    FROM partners p
    CROSS JOIN threshold_config tc
    WHERE NULLIF(btrim(COALESCE(p_name, '')), '') IS NOT NULL
      AND similarity(p.name, p_name) >= tc.threshold_value
    ORDER BY similarity_score DESC, p.name ASC
    LIMIT 1
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'partner_id', r.partner_id,
        'name', r.name,
        'normalized_name', r.normalized_name,
        'domain', r.domain,
        'partner_type', r.partner_type,
        'similarity', r.similarity_score
      )
      FROM ranked r
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_sku(
  p_text text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH threshold_config AS (
    SELECT COALESCE(NULLIF(current_setting('dash.trgm_threshold', true), ''), '0.3')::real AS threshold_value
  ),
  variant_scores AS (
    SELECT
      s.sku_id,
      s.name,
      s.normalized_name,
      s.variants,
      GREATEST(
        similarity(s.name, p_text),
        similarity(s.normalized_name, lower(p_text)),
        COALESCE(
          (
            SELECT MAX(similarity(v.variant, p_text))
            FROM unnest(s.variants) AS v(variant)
          ),
          0
        )
      ) AS similarity_score
    FROM skus s
    CROSS JOIN threshold_config tc
    WHERE NULLIF(btrim(COALESCE(p_text, '')), '') IS NOT NULL
  ),
  ranked AS (
    SELECT *
    FROM variant_scores
    WHERE similarity_score >= (SELECT threshold_value FROM threshold_config)
    ORDER BY similarity_score DESC, name ASC
    LIMIT 1
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'sku_id', r.sku_id,
        'name', r.name,
        'normalized_name', r.normalized_name,
        'variants', to_jsonb(r.variants),
        'similarity', r.similarity_score
      )
      FROM ranked r
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.get_commitment_status(
  p_commitment_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH latest_event AS (
    SELECT DISTINCT ON (ce.commitment_id)
      ce.commitment_id,
      ce.seq,
      ce.event_type,
      ce.event_time,
      ce.event_time_source,
      ce.event_time_confidence,
      ce.event_time_reason,
      ce.event_time_provenance,
      ce.recorded_at,
      ce.relationship_id,
      ce.payload,
      ce.evidence_span_ids,
      ce.extractor,
      ce.confidence,
      ce.epistemic_class
    FROM dash_private.commitment_events ce
    WHERE ce.commitment_id = p_commitment_id
    ORDER BY ce.commitment_id, ce.seq DESC
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'commitment_id', le.commitment_id,
        'seq', le.seq,
        'current_status', le.event_type,
        'event_time', le.event_time,
        'event_time_source', le.event_time_source,
        'event_time_confidence', le.event_time_confidence,
        'event_time_reason', le.event_time_reason,
        'event_time_provenance', le.event_time_provenance,
        'is_time_uncertain', (le.event_time_source = 'inferred_fallback' OR le.event_time_confidence = 'low'),
        'recorded_at', le.recorded_at,
        'relationship_id', le.relationship_id,
        'partner_id', rel.partner_id,
        'partner_name', p.name,
        'payload', le.payload,
        'evidence_span_ids', to_jsonb(le.evidence_span_ids),
        'extractor', le.extractor,
        'confidence', le.confidence,
        'epistemic_class', le.epistemic_class
      )
      FROM latest_event le
      JOIN relationships rel ON rel.relationship_id = le.relationship_id
      JOIN partners p ON p.partner_id = rel.partner_id
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.list_open_commitments(
  p_partner_id uuid,
  p_date_range tstzrange
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH latest_events AS (
    SELECT DISTINCT ON (ce.commitment_id)
      ce.commitment_id,
      ce.seq,
      ce.event_type,
      ce.event_time,
      ce.event_time_source,
      ce.event_time_confidence,
      ce.event_time_reason,
      ce.event_time_provenance,
      ce.relationship_id,
      ce.payload,
      ce.confidence,
      ce.epistemic_class
    FROM dash_private.commitment_events ce
    ORDER BY ce.commitment_id, ce.seq DESC
  ),
  filtered AS (
    SELECT
      le.commitment_id,
      le.seq,
      le.event_type,
      le.event_time,
      le.event_time_source,
      le.event_time_confidence,
      le.event_time_reason,
      le.event_time_provenance,
      le.relationship_id,
      le.payload,
      le.confidence,
      le.epistemic_class,
      rel.partner_id,
      rel.status AS relationship_status,
      p.name AS partner_name
    FROM latest_events le
    JOIN relationships rel ON rel.relationship_id = le.relationship_id
    JOIN partners p ON p.partner_id = rel.partner_id
    WHERE (p_partner_id IS NULL OR rel.partner_id = p_partner_id)
      AND (p_date_range IS NULL OR le.event_time <@ p_date_range)
      AND rel.status = 'active'
      AND le.event_type <> 'cancelled'
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'commitment_id', f.commitment_id,
        'seq', f.seq,
        'current_status', f.event_type,
        'event_time', f.event_time,
        'event_time_source', f.event_time_source,
        'event_time_confidence', f.event_time_confidence,
        'event_time_reason', f.event_time_reason,
        'event_time_provenance', f.event_time_provenance,
        'is_time_uncertain', (f.event_time_source = 'inferred_fallback' OR f.event_time_confidence = 'low'),
        'relationship_id', f.relationship_id,
        'partner_id', f.partner_id,
        'partner_name', f.partner_name,
        'payload', f.payload,
        'confidence', f.confidence,
        'epistemic_class', f.epistemic_class
      )
      ORDER BY f.event_time DESC, f.commitment_id
    ),
    '[]'::jsonb
  )
  FROM filtered f;
$$;

CREATE OR REPLACE FUNCTION public.get_reconciliation_deltas(
  p_commitment_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'commitment_id', r.commitment_id,
        'relationship_id', r.relationship_id,
        'committed_quantity', r.committed_quantity,
        'fulfilled_quantity', r.fulfilled_quantity,
        'shortfall', r.shortfall,
        'committed_amount', r.committed_amount,
        'sku', r.sku
      )
      FROM public.reconciliation r
      WHERE r.commitment_id = p_commitment_id
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.get_recent_communications(
  p_relationship_id uuid,
  p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'communication_id', c.communication_id,
          'artifact_id', c.artifact_id,
          'relationship_id', c.relationship_id,
          'contact_id', c.contact_id,
          'contact_name', ct.name,
          'direction', c.direction,
          'subject', c.subject,
          'summary', c.summary,
          'communication_date', c.communication_date,
          'thread_id', c.thread_id
        )
        ORDER BY c.communication_date DESC, c.communication_id DESC
      )
      FROM (
        SELECT *
        FROM communications
        WHERE p_relationship_id IS NOT NULL
          AND relationship_id = p_relationship_id
        ORDER BY communication_date DESC, communication_id DESC
        LIMIT GREATEST(COALESCE(p_limit, 10), 0)
      ) c
      LEFT JOIN contacts ct ON ct.contact_id = c.contact_id
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.get_fulfillment_state(
  p_commitment_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'event_id', fe.event_id,
          'seq', fe.seq,
          'event_type', fe.event_type,
          'event_time', fe.event_time,
          'event_time_source', fe.event_time_source,
          'event_time_confidence', fe.event_time_confidence,
          'event_time_reason', fe.event_time_reason,
          'event_time_provenance', fe.event_time_provenance,
          'is_time_uncertain', (fe.event_time_source = 'inferred_fallback' OR fe.event_time_confidence = 'low'),
          'quantity', fe.payload->>'quantity',
          'sku', fe.payload->>'sku',
          'tracking_number', fe.payload->>'tracking_number',
          'carrier', fe.payload->>'carrier',
          'location', fe.payload->>'location',
          'evidence_span_ids', to_jsonb(fe.evidence_span_ids),
          'confidence', fe.confidence
        )
        ORDER BY fe.seq ASC
      )
      FROM dash_private.fulfillment_events fe
      WHERE p_commitment_id IS NOT NULL
        AND fe.commitment_id = p_commitment_id
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.get_payment_obligations(
  p_date_range tstzrange
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH invoice_events AS (
    SELECT
      ce.commitment_id,
      ce.relationship_id,
      ce.event_time,
      ce.payload
    FROM dash_private.commitment_events ce
    WHERE ce.event_type = 'invoice_issued'
      AND (
        p_date_range IS NULL
        OR ((ce.payload->>'due_date')::timestamptz <@ p_date_range)
      )
  ),
  latest_payments AS (
    SELECT DISTINCT ON (ce.commitment_id)
      ce.commitment_id,
      ce.payload->>'reference_id' AS payment_reference,
      ce.event_time AS payment_time
    FROM dash_private.commitment_events ce
    WHERE ce.event_type = 'payment_made'
    ORDER BY ce.commitment_id, ce.seq DESC
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'commitment_id', ie.commitment_id,
        'partner_name', p.name,
        'invoice_number', ie.payload->>'invoice_number',
        'amount', ie.payload->>'amount',
        'due_date', ie.payload->>'due_date',
        'paid', (lp.commitment_id IS NOT NULL),
        'payment_reference', lp.payment_reference
      )
      ORDER BY (ie.payload->>'due_date')::timestamptz ASC, ie.commitment_id
    ),
    '[]'::jsonb
  )
  FROM invoice_events ie
  JOIN relationships rel ON rel.relationship_id = ie.relationship_id
  JOIN partners p ON p.partner_id = rel.partner_id
  LEFT JOIN latest_payments lp ON lp.commitment_id = ie.commitment_id;
$$;

CREATE OR REPLACE FUNCTION public.get_evidence_for_claim(
  p_evidence_span_ids bigint[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'evidence_span_id', es.evidence_span_id,
          'artifact_id', es.artifact_id,
          'locator', es.locator,
          'extracted_text', es.extracted_text,
          'source_system', a.source_system,
          'source_locator', a.source_locator,
          'source_revision', a.source_revision,
          'mime_type', a.mime_type,
          'storage_uri', a.storage_uri,
          'captured_at', a.captured_at,
          'artifact_metadata', a.metadata
        )
        ORDER BY es.evidence_span_id
      )
      FROM evidence_spans es
      JOIN artifacts a ON a.artifact_id = es.artifact_id
      WHERE COALESCE(array_length(p_evidence_span_ids, 1), 0) > 0
        AND es.evidence_span_id = ANY (p_evidence_span_ids)
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.search_evidence_text(
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH search_term AS (
    SELECT websearch_to_tsquery('english', p_query) AS query
    WHERE NULLIF(btrim(COALESCE(p_query, '')), '') IS NOT NULL
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'evidence_span_id', es.evidence_span_id,
          'artifact_id', es.artifact_id,
          'extracted_text', es.extracted_text,
          'source_system', a.source_system,
          'source_locator', a.source_locator,
          'locator', es.locator,
          'rank', ts_rank(es.fts, st.query)
        )
        ORDER BY ts_rank(es.fts, st.query) DESC, es.evidence_span_id
      )
      FROM (
        SELECT
          es.evidence_span_id,
          es.artifact_id,
          es.extracted_text,
          es.locator,
          es.fts
        FROM evidence_spans es
        CROSS JOIN search_term st
        WHERE es.fts @@ st.query
        ORDER BY ts_rank(es.fts, st.query) DESC, es.evidence_span_id
        LIMIT GREATEST(COALESCE(p_limit, 20), 0)
      ) es
      JOIN artifacts a ON a.artifact_id = es.artifact_id
      CROSS JOIN search_term st
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.search_entities_fuzzy(
  p_query text,
  p_entity_type text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH threshold_config AS (
    SELECT COALESCE(NULLIF(current_setting('dash.trgm_threshold', true), ''), '0.3')::real AS threshold_value
  ),
  partner_matches AS (
    SELECT
      p.partner_id::text AS entity_id,
      p.name,
      similarity(p.name, p_query) AS similarity_score,
      'partner'::text AS entity_type
    FROM partners p
    CROSS JOIN threshold_config tc
    WHERE lower(COALESCE(p_entity_type, '')) = 'partner'
      AND NULLIF(btrim(COALESCE(p_query, '')), '') IS NOT NULL
      AND similarity(p.name, p_query) >= tc.threshold_value
  ),
  sku_matches AS (
    SELECT
      s.sku_id::text AS entity_id,
      s.name,
      GREATEST(
        similarity(s.name, p_query),
        COALESCE(
          (
            SELECT MAX(similarity(v.variant, p_query))
            FROM unnest(s.variants) AS v(variant)
          ),
          0
        )
      ) AS similarity_score,
      'sku'::text AS entity_type
    FROM skus s
    WHERE lower(COALESCE(p_entity_type, '')) = 'sku'
      AND NULLIF(btrim(COALESCE(p_query, '')), '') IS NOT NULL
  ),
  contact_matches AS (
    SELECT
      c.contact_id::text AS entity_id,
      c.name,
      GREATEST(
        similarity(c.name, p_query),
        similarity(COALESCE(c.email, ''), p_query)
      ) AS similarity_score,
      'contact'::text AS entity_type
    FROM contacts c
    WHERE lower(COALESCE(p_entity_type, '')) = 'contact'
      AND NULLIF(btrim(COALESCE(p_query, '')), '') IS NOT NULL
  ),
  combined AS (
    SELECT * FROM partner_matches
    UNION ALL
    SELECT *
    FROM sku_matches
    WHERE similarity_score >= (SELECT threshold_value FROM threshold_config)
    UNION ALL
    SELECT *
    FROM contact_matches
    WHERE similarity_score >= (SELECT threshold_value FROM threshold_config)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'entity_id', c.entity_id,
        'name', c.name,
        'similarity', c.similarity_score,
        'entity_type', c.entity_type
      )
      ORDER BY c.similarity_score DESC, c.name ASC
    ),
    '[]'::jsonb
  )
  FROM combined c;
$$;

-- TEST 1: resolve_supplier
-- SELECT resolve_supplier('pacific pack');

-- TEST 2: resolve_sku
-- SELECT resolve_sku('6oz sample bottles');

-- TEST 3: get_commitment_status
-- SELECT get_commitment_status('00000000-0000-0000-0000-000000000501');

-- TEST 4: list_open_commitments
-- SELECT list_open_commitments('00000000-0000-0000-0000-000000000101', NULL);

-- TEST 5: get_reconciliation_deltas
-- SELECT get_reconciliation_deltas('00000000-0000-0000-0000-000000000502');

-- TEST 6: get_recent_communications
-- SELECT get_recent_communications('00000000-0000-0000-0000-000000000301', 5);

-- TEST 7: get_fulfillment_state (no fulfillment)
-- SELECT get_fulfillment_state('00000000-0000-0000-0000-000000000501');

-- TEST 8: get_fulfillment_state (full lifecycle)
-- SELECT get_fulfillment_state('00000000-0000-0000-0000-000000000503');

-- TEST 9: get_payment_obligations
-- SELECT get_payment_obligations(tstzrange(now() - interval '30 days', now() + interval '30 days'));

-- TEST 10: get_evidence_for_claim
-- SELECT get_evidence_for_claim(ARRAY[2001, 2006]);

-- TEST 11: search_evidence_text
-- SELECT search_evidence_text('production complete', 10);

-- TEST 12: search_entities_fuzzy
-- SELECT search_entities_fuzzy('pacific', 'partner');

-- TEST 13: NULL/empty input handling
-- SELECT resolve_supplier(NULL);
-- SELECT get_fulfillment_state(NULL);
-- SELECT get_evidence_for_claim(ARRAY[]::bigint[]);
-- SELECT list_open_commitments(NULL, NULL);
