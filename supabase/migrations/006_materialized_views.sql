-- Milestone 0 | 006_materialized_views.sql | Traces to: ARCHITECTURE-dash.md §6.2; README.md D-003

CREATE MATERIALIZED VIEW IF NOT EXISTS public.commitment_current_state AS
SELECT DISTINCT ON (commitment_id)
  commitment_id,
  relationship_id,
  event_type AS current_status,
  event_time AS last_event_time,
  payload AS current_payload,
  confidence,
  epistemic_class
FROM dash_private.commitment_events
ORDER BY commitment_id, seq DESC;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.reconciliation AS
SELECT
  ce.commitment_id,
  ce.relationship_id,
  (ce.payload->>'quantity')::integer AS committed_quantity,
  COALESCE(SUM((fe.payload->>'quantity')::integer), 0) AS fulfilled_quantity,
  (ce.payload->>'quantity')::integer - COALESCE(SUM((fe.payload->>'quantity')::integer), 0) AS shortfall,
  ce.payload->>'sku' AS sku,
  ce.payload->>'amount' AS committed_amount
FROM dash_private.commitment_events ce
LEFT JOIN dash_private.fulfillment_events fe
  ON fe.commitment_id = ce.commitment_id
WHERE ce.event_type = 'quantity_committed'
GROUP BY ce.commitment_id, ce.relationship_id, ce.payload;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.daily_driver AS
WITH latest_milestone AS (
  SELECT DISTINCT ON (ce.commitment_id)
    ce.commitment_id,
    ce.payload->>'date' AS committed_ship_date
  FROM dash_private.commitment_events ce
  WHERE ce.event_type = 'milestone_set'
  ORDER BY ce.commitment_id, ce.seq DESC
),
latest_quantity_committed AS (
  SELECT DISTINCT ON (ce.commitment_id)
    ce.commitment_id,
    ce.payload->>'due_date' AS quantity_due_date
  FROM dash_private.commitment_events ce
  WHERE ce.event_type = 'quantity_committed'
  ORDER BY ce.commitment_id, ce.seq DESC
),
fulfillment_status AS (
  SELECT
    fe.commitment_id,
    COUNT(*) AS fulfillment_event_count,
    BOOL_OR(fe.event_type = 'shipped') AS has_shipped,
    BOOL_OR(fe.event_type IN ('received', 'delivered')) AS has_received_or_delivered,
    MAX(fe.event_time) FILTER (WHERE fe.event_type = 'shipped') AS latest_shipped_at
  FROM dash_private.fulfillment_events fe
  GROUP BY fe.commitment_id
),
invoice_status AS (
  SELECT
    ce.commitment_id,
    BOOL_OR(ce.event_type = 'invoice_issued') AS has_invoice_issued,
    BOOL_OR(ce.event_type = 'payment_made') AS has_payment_made,
    MAX((ce.payload->>'due_date')::timestamptz) FILTER (WHERE ce.event_type = 'invoice_issued') AS invoice_due_date
  FROM dash_private.commitment_events ce
  WHERE ce.event_type IN ('invoice_issued', 'payment_made')
  GROUP BY ce.commitment_id
),
last_communication AS (
  SELECT
    c.relationship_id,
    MAX(c.communication_date) AS last_communication_date
  FROM communications c
  GROUP BY c.relationship_id
)
SELECT
  cs.commitment_id,
  cs.relationship_id,
  p.name AS partner_name,
  cs.current_status,
  cs.current_payload,
  cs.last_event_time,
  cs.epistemic_class,
  r.shortfall,
  CASE
    WHEN derived.next_actionable_date::date < CURRENT_DATE THEN 'overdue'
    WHEN derived.next_actionable_date::date = CURRENT_DATE THEN 'today'
    WHEN derived.next_actionable_date::date <= CURRENT_DATE + INTERVAL '7 days' THEN 'this_week'
    ELSE 'later'
  END AS temporal_bucket,
  derived.next_actionable_date,
  (
    COALESCE(r.shortfall, 0) <> 0
    OR (
      rel.status = 'active'
      AND (
        lc.last_communication_date IS NULL
        OR lc.last_communication_date < now() - INTERVAL '14 days'
      )
    )
  ) AS is_anomaly,
  CASE
    WHEN (
      COALESCE(r.shortfall, 0) <> 0
      OR (
        rel.status = 'active'
        AND (
          lc.last_communication_date IS NULL
          OR lc.last_communication_date < now() - INTERVAL '14 days'
        )
      )
    ) THEN 0
    ELSE 1
  END AS sort_priority
FROM public.commitment_current_state cs
JOIN relationships rel
  ON rel.relationship_id = cs.relationship_id
JOIN partners p
  ON p.partner_id = rel.partner_id
LEFT JOIN public.reconciliation r
  ON r.commitment_id = cs.commitment_id
LEFT JOIN latest_milestone lm
  ON lm.commitment_id = cs.commitment_id
LEFT JOIN latest_quantity_committed lqc
  ON lqc.commitment_id = cs.commitment_id
LEFT JOIN fulfillment_status fs
  ON fs.commitment_id = cs.commitment_id
LEFT JOIN invoice_status inv
  ON inv.commitment_id = cs.commitment_id
LEFT JOIN last_communication lc
  ON lc.relationship_id = cs.relationship_id
LEFT JOIN LATERAL (
  SELECT COALESCE(
    CASE
      WHEN COALESCE(fs.fulfillment_event_count, 0) = 0 THEN
        COALESCE(
          NULLIF(lm.committed_ship_date, '')::timestamptz,
          NULLIF(lqc.quantity_due_date, '')::timestamptz
        )
      WHEN fs.has_shipped AND NOT fs.has_received_or_delivered THEN
        fs.latest_shipped_at + INTERVAL '7 days'
      WHEN fs.has_received_or_delivered
        AND COALESCE(inv.has_invoice_issued, false)
        AND NOT COALESCE(inv.has_payment_made, false) THEN
        inv.invoice_due_date
      ELSE NULL
    END,
    lc.last_communication_date,
    created_event.event_time,
    cs.last_event_time
  ) AS next_actionable_date
  FROM (
    SELECT ce.event_time
    FROM dash_private.commitment_events ce
    WHERE ce.commitment_id = cs.commitment_id
      AND ce.event_type = 'created'
    ORDER BY ce.seq ASC
    LIMIT 1
  ) AS created_event
) AS derived ON true;
