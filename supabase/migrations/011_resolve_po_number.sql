-- Milestone 5 hardening | 011_resolve_po_number.sql

CREATE OR REPLACE FUNCTION public.resolve_po_number(
  p_po_text text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH normalized_input AS (
    SELECT regexp_replace(lower(COALESCE(p_po_text, '')), '[^a-z0-9]+', '', 'g') AS po_norm
  ),
  matching_evidence AS (
    SELECT
      es.evidence_span_id,
      es.artifact_id,
      a.captured_at
    FROM evidence_spans es
    JOIN artifacts a ON a.artifact_id = es.artifact_id
    CROSS JOIN normalized_input ni
    WHERE ni.po_norm <> ''
      AND (
        regexp_replace(lower(COALESCE(es.extracted_text, '')), '[^a-z0-9]+', '', 'g') LIKE '%' || ni.po_norm || '%'
        OR regexp_replace(lower(COALESCE(a.metadata->>'subject', '')), '[^a-z0-9]+', '', 'g') LIKE '%' || ni.po_norm || '%'
      )
  ),
  commitment_matches AS (
    SELECT
      ce.commitment_id,
      ce.relationship_id,
      rel.partner_id,
      p.name AS partner_name,
      COUNT(*) AS match_score,
      MAX(ce.seq) AS latest_seq,
      MAX(me.captured_at) AS latest_evidence_at,
      array_agg(DISTINCT me.evidence_span_id ORDER BY me.evidence_span_id) AS matched_evidence_span_ids
    FROM dash_private.commitment_events ce
    JOIN relationships rel ON rel.relationship_id = ce.relationship_id
    JOIN partners p ON p.partner_id = rel.partner_id
    JOIN matching_evidence me ON me.evidence_span_id = ANY (ce.evidence_span_ids)
    GROUP BY ce.commitment_id, ce.relationship_id, rel.partner_id, p.name
  ),
  ranked AS (
    SELECT *
    FROM commitment_matches
    ORDER BY match_score DESC, latest_seq DESC, latest_evidence_at DESC, commitment_id
    LIMIT 1
  )
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'commitment_id', r.commitment_id,
        'relationship_id', r.relationship_id,
        'partner_id', r.partner_id,
        'partner_name', r.partner_name,
        'matched_evidence_span_ids', to_jsonb(r.matched_evidence_span_ids),
        'match_score', r.match_score
      )
      FROM ranked r
    ),
    '{}'::jsonb
  );
$$;
