-- Milestone 1 | seed.sql | Traces to: ARCHITECTURE-dash.md §6.1, §6.2, §8.4, §12 Phase 1; README.md D-002, D-003

BEGIN;

INSERT INTO partners (
  partner_id,
  name,
  normalized_name,
  domain,
  partner_type,
  metadata,
  created_at
)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'Pacific Packaging', 'pacific packaging', 'pacificpackaging.com', 'supplier', '{"region":"West Coast","category":"primary packaging"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000102', 'Cedar Fragrance Labs', 'cedar fragrance labs', 'cedarfragrance.com', 'supplier', '{"region":"Midwest","category":"fragrance"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000103', 'High Plains Fulfillment', 'high plains fulfillment', 'highplains3pl.com', '3pl', '{"region":"Mountain","category":"fulfillment"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000104', 'Canyon Freight Lines', 'canyon freight lines', 'canyonfreight.com', 'freight', '{"region":"Southwest","category":"freight"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000105', 'BrightLabel Works', 'brightlabel works', 'brightlabel.com', 'packaging', '{"region":"Pacific Northwest","category":"labels"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000106', 'Harbor Caps Co', 'harbor caps co', 'harborcaps.com', 'supplier', '{"region":"Southeast","category":"closures"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000107', 'Summit Carton Supply', 'summit carton supply', 'summitcarton.com', 'packaging', '{"region":"Mid-Atlantic","category":"cartons"}'::jsonb, now())
ON CONFLICT (partner_id) DO UPDATE
SET
  name = EXCLUDED.name,
  normalized_name = EXCLUDED.normalized_name,
  domain = EXCLUDED.domain,
  partner_type = EXCLUDED.partner_type,
  metadata = EXCLUDED.metadata;

INSERT INTO contacts (
  contact_id,
  partner_id,
  name,
  email,
  phone,
  role,
  metadata,
  created_at
)
VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Sarah Chen', 'sarah@pacificpackaging.com', '415-555-0101', 'Account Manager', '{"timezone":"America/Los_Angeles"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 'Diego Alvarez', 'diego@cedarfragrance.com', '312-555-0102', 'Sales Director', '{"timezone":"America/Chicago"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000103', 'Megan Holt', 'megan@highplains3pl.com', '303-555-0103', 'Operations Lead', '{"timezone":"America/Denver"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000104', 'Cole Mercer', 'cole@canyonfreight.com', '602-555-0104', 'Dispatch Manager', '{"timezone":"America/Phoenix"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000105', 'Priya Nair', 'priya@brightlabel.com', '206-555-0105', 'Client Success', '{"timezone":"America/Los_Angeles"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000106', 'Owen Park', 'owen@harborcaps.com', '404-555-0106', 'Production Planner', '{"timezone":"America/New_York"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000107', 'Laura Kim', 'laura@summitcarton.com', '215-555-0107', 'Account Executive', '{"timezone":"America/New_York"}'::jsonb, now())
ON CONFLICT (contact_id) DO UPDATE
SET
  partner_id = EXCLUDED.partner_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  metadata = EXCLUDED.metadata;

INSERT INTO skus (
  sku_id,
  name,
  normalized_name,
  variants,
  metadata,
  created_at
)
VALUES
  ('00000000-0000-0000-0000-000000000401', '6oz Sample Bottle', '6oz sample bottle', ARRAY['6oz sample bottles', '6 oz sample'], '{"category":"packaging","unit":"bottle"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000402', 'Lavender Body Wash 12oz', 'lavender body wash 12oz', ARRAY['lavender wash 12 oz', '12oz lavender body wash'], '{"category":"finished_good","unit":"bottle"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000403', 'Citrus Hand Soap 8oz', 'citrus hand soap 8oz', ARRAY['8oz citrus hand soap', 'citrus hand wash'], '{"category":"finished_good","unit":"bottle"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000404', 'Unscented Refill Pouch 32oz', 'unscented refill pouch 32oz', ARRAY['32oz refill pouch', 'unscented refill'], '{"category":"finished_good","unit":"pouch"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000405', 'Foaming Pump Cap', 'foaming pump cap', ARRAY['foam pump', 'pump cap'], '{"category":"component","unit":"cap"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000406', 'Waterproof Label Set', 'waterproof label set', ARRAY['label set', 'waterproof labels'], '{"category":"packaging","unit":"set"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000407', 'Travel Starter Kit', 'travel starter kit', ARRAY['starter kit', 'travel kit'], '{"category":"bundle","unit":"kit"}'::jsonb, now())
ON CONFLICT (sku_id) DO UPDATE
SET
  name = EXCLUDED.name,
  normalized_name = EXCLUDED.normalized_name,
  variants = EXCLUDED.variants,
  metadata = EXCLUDED.metadata;

INSERT INTO artifacts (
  artifact_id,
  source_system,
  source_locator,
  source_revision,
  content_sha256,
  mime_type,
  storage_uri,
  captured_at,
  metadata
)
VALUES
  (1001, 'gmail', 'msg-pacific-2026-02-08', NULL, decode('0000000000000000000000000000000000000000000000000000000000001001', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/02/msg-pacific-2026-02-08.eml', timestamptz '2026-02-08 09:14:00+00', '{"from":"sarah@pacificpackaging.com","to":"matt@moziwash.com","subject":"PO 4412 production update"}'::jsonb),
  (1002, 'gmail', 'msg-pacific-followup-2026-02-22', NULL, decode('0000000000000000000000000000000000000000000000000000000000001002', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/02/msg-pacific-followup-2026-02-22.eml', timestamptz '2026-02-22 16:30:00+00', '{"from":"matt@moziwash.com","to":"sarah@pacificpackaging.com","subject":"Re: PO 4412 production update"}'::jsonb),
  (1003, 'gmail', 'msg-cedar-terms-01', NULL, decode('0000000000000000000000000000000000000000000000000000000000001003', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/03/msg-cedar-terms-01.eml', now() - interval '6 days', '{"from":"diego@cedarfragrance.com","to":"matt@moziwash.com","subject":"Lavender concentrate release"}'::jsonb),
  (1004, 'gmail', 'msg-highplains-ops-01', NULL, decode('0000000000000000000000000000000000000000000000000000000000001004', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/03/msg-highplains-ops-01.eml', now() - interval '4 days', '{"from":"megan@highplains3pl.com","to":"ops@moziwash.com","subject":"Starter kit receiving status"}'::jsonb),
  (1005, 'gmail', 'msg-canyon-freight-01', NULL, decode('0000000000000000000000000000000000000000000000000000000000001005', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/03/msg-canyon-freight-01.eml', now() - interval '3 days', '{"from":"cole@canyonfreight.com","to":"ops@moziwash.com","subject":"Linehaul booked for pouch shipment"}'::jsonb),
  (1006, 'gmail', 'msg-brightlabel-01', NULL, decode('0000000000000000000000000000000000000000000000000000000000001006', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/03/msg-brightlabel-01.eml', now() - interval '2 days', '{"from":"priya@brightlabel.com","to":"matt@moziwash.com","subject":"12,500 label run and invoice"}'::jsonb),
  (1007, 'gmail', 'msg-harborcaps-01', NULL, decode('0000000000000000000000000000000000000000000000000000000000001007', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/03/msg-harborcaps-01.eml', now() - interval '1 days', '{"from":"owen@harborcaps.com","to":"ops@moziwash.com","subject":"Pump cap date moved"}'::jsonb),
  (1008, 'gmail', 'msg-summitcarton-01', NULL, decode('0000000000000000000000000000000000000000000000000000000000001008', 'hex'), 'message/rfc822', 'artifacts/gmail/2026/02/msg-summitcarton-01.eml', now() - interval '21 days', '{"from":"laura@summitcarton.com","to":"matt@moziwash.com","subject":"Carton die-line approval"}'::jsonb)
ON CONFLICT (artifact_id) DO UPDATE
SET
  source_system = EXCLUDED.source_system,
  source_locator = EXCLUDED.source_locator,
  source_revision = EXCLUDED.source_revision,
  content_sha256 = EXCLUDED.content_sha256,
  mime_type = EXCLUDED.mime_type,
  storage_uri = EXCLUDED.storage_uri,
  captured_at = EXCLUDED.captured_at,
  metadata = EXCLUDED.metadata;

INSERT INTO evidence_spans (
  evidence_span_id,
  artifact_id,
  locator,
  extracted_text,
  snippet_sha256,
  created_at
)
VALUES
  (2001, 1001, '{"char_start": 118, "char_end": 173}'::jsonb, 'Production complete on the 6oz sample bottles. Net 30 starts when the shipment leaves our dock.', decode('0000000000000000000000000000000000000000000000000000000000002001', 'hex'), timestamptz '2026-02-08 09:15:00+00'),
  (2002, 1002, '{"char_start": 74, "char_end": 144}'::jsonb, 'Following up on PO 4412. We still do not have tracking or a confirmed ship scan.', decode('0000000000000000000000000000000000000000000000000000000000002002', 'hex'), timestamptz '2026-02-22 16:31:00+00'),
  (2003, 1003, '{"char_start": 55, "char_end": 148}'::jsonb, 'Lavender concentrate can release in 18 days. Terms remain 50 percent deposit, balance Net 15.', decode('0000000000000000000000000000000000000000000000000000000000002003', 'hex'), now() - interval '6 days'),
  (2004, 1004, '{"char_start": 32, "char_end": 133}'::jsonb, 'We logged 180 travel starter kits received, with 20 units damaged and staged for return.', decode('0000000000000000000000000000000000000000000000000000000000002004', 'hex'), now() - interval '4 days'),
  (2005, 1005, '{"char_start": 41, "char_end": 122}'::jsonb, 'Linehaul booked for the refill pouch shipment. Estimated delivery is seven days from pickup.', decode('0000000000000000000000000000000000000000000000000000000000002005', 'hex'), now() - interval '3 days'),
  (2006, 1006, '{"char_start": 27, "char_end": 131}'::jsonb, 'We completed 12,500 waterproof label sets and invoiced the full run at 0.42 per set.', decode('0000000000000000000000000000000000000000000000000000000000002006', 'hex'), now() - interval '2 days'),
  (2007, 1007, '{"char_start": 89, "char_end": 176}'::jsonb, 'Foaming pump cap ship date moved from next Monday to three business days later due to tooling.', decode('0000000000000000000000000000000000000000000000000000000000002007', 'hex'), now() - interval '1 days'),
  (2008, 1008, '{"char_start": 63, "char_end": 151}'::jsonb, 'Carton die-line approved. MOQ stays at 5,000 cartons and lead time is 21 days.', decode('0000000000000000000000000000000000000000000000000000000000002008', 'hex'), now() - interval '21 days'),
  (2009, 1006, '{"char_start": 144, "char_end": 223}'::jsonb, 'Invoice BL-2048 reflects the full 12,500 labels. Payment due on receipt of goods.', decode('0000000000000000000000000000000000000000000000000000000000002009', 'hex'), now() - interval '2 days'),
  (2010, 1004, '{"char_start": 141, "char_end": 223}'::jsonb, 'Return authorization is open for the 20 damaged kits once carrier pickup is scheduled.', decode('0000000000000000000000000000000000000000000000000000000000002010', 'hex'), now() - interval '4 days')
ON CONFLICT (evidence_span_id) DO UPDATE
SET
  artifact_id = EXCLUDED.artifact_id,
  locator = EXCLUDED.locator,
  extracted_text = EXCLUDED.extracted_text,
  snippet_sha256 = EXCLUDED.snippet_sha256,
  created_at = EXCLUDED.created_at;

INSERT INTO relationships (
  relationship_id,
  partner_id,
  status,
  negotiated_terms,
  terms_evidence,
  created_at,
  updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'active', '{"payment_terms":"Net 30 from ship date","lead_time_days":21,"moq_units":1200}'::jsonb, ARRAY[2001], now(), now()),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000102', 'active', '{"payment_terms":"50 percent deposit, Net 15 balance","lead_time_days":18,"moq_units":300}'::jsonb, ARRAY[2003], now(), now()),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000103', 'active', '{"payment_terms":"Net 15","lead_time_days":5,"moq_units":100}'::jsonb, ARRAY[2004], now(), now()),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000104', 'active', '{"payment_terms":"Net 10","lead_time_days":7,"moq_units":1}'::jsonb, ARRAY[2005], now(), now()),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000105', 'active', '{"payment_terms":"Due on receipt","lead_time_days":14,"moq_units":5000}'::jsonb, ARRAY[2006, 2009], now(), now()),
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000106', 'active', '{"payment_terms":"Net 20","lead_time_days":10,"moq_units":2000}'::jsonb, ARRAY[2007], now(), now()),
  ('00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000107', 'active', '{"payment_terms":"Net 30","lead_time_days":21,"moq_units":5000}'::jsonb, ARRAY[2008], now(), now())
ON CONFLICT (relationship_id) DO UPDATE
SET
  partner_id = EXCLUDED.partner_id,
  status = EXCLUDED.status,
  negotiated_terms = EXCLUDED.negotiated_terms,
  terms_evidence = EXCLUDED.terms_evidence,
  updated_at = EXCLUDED.updated_at;

INSERT INTO communications (
  communication_id,
  artifact_id,
  relationship_id,
  contact_id,
  direction,
  subject,
  summary,
  communication_date,
  thread_id,
  metadata,
  created_at
)
VALUES
  (5001, 1001, '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'inbound', 'PO 4412 production update', 'Sarah confirmed production is complete for the 6oz sample bottles and restated Net 30 from ship date.', timestamptz '2026-02-08 09:14:00+00', 'thread-pacific-4412', '{"labels":["supplier_update"]}'::jsonb, now()),
  (5002, 1002, '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'outbound', 'Re: PO 4412 production update', 'Matt asked for tracking and a confirmed ship scan for PO 4412.', timestamptz '2026-02-22 16:30:00+00', 'thread-pacific-4412', '{"labels":["follow_up"]}'::jsonb, now()),
  (5003, 1003, '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202', 'inbound', 'Lavender concentrate release', 'Cedar Fragrance Labs confirmed lead time and deposit terms for the next batch.', now() - interval '6 days', 'thread-cedar-lavender', '{"labels":["terms"]}'::jsonb, now()),
  (5004, 1004, '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000203', 'inbound', 'Starter kit receiving status', 'High Plains reported a partial receipt and damaged units staged for return.', now() - interval '4 days', 'thread-highplains-kits', '{"labels":["receiving"]}'::jsonb, now()),
  (5005, 1005, '00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000204', 'inbound', 'Linehaul booked for pouch shipment', 'Canyon Freight booked the refill pouch shipment with a seven-day delivery estimate.', now() - interval '3 days', 'thread-canyon-pouch', '{"labels":["freight"]}'::jsonb, now()),
  (5006, 1006, '00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000205', 'inbound', '12,500 label run and invoice', 'BrightLabel confirmed the 12,500 label run and sent the full invoice.', now() - interval '2 days', 'thread-brightlabel-run', '{"labels":["invoice","production"]}'::jsonb, now()),
  (5007, 1007, '00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000206', 'inbound', 'Pump cap date moved', 'Harbor Caps moved the pump cap ship date by three business days.', now() - interval '1 days', 'thread-harborcaps-shift', '{"labels":["delay"]}'::jsonb, now()),
  (5008, 1008, '00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000207', 'inbound', 'Carton die-line approval', 'Summit Carton confirmed MOQ and lead time on the carton run.', now() - interval '21 days', 'thread-summit-carton', '{"labels":["approval"]}'::jsonb, now())
ON CONFLICT (communication_id) DO UPDATE
SET
  artifact_id = EXCLUDED.artifact_id,
  relationship_id = EXCLUDED.relationship_id,
  contact_id = EXCLUDED.contact_id,
  direction = EXCLUDED.direction,
  subject = EXCLUDED.subject,
  summary = EXCLUDED.summary,
  communication_date = EXCLUDED.communication_date,
  thread_id = EXCLUDED.thread_id,
  metadata = EXCLUDED.metadata;

INSERT INTO processing_jobs (
  job_id,
  artifact_id,
  stage,
  status,
  started_at,
  completed_at,
  result,
  error,
  retry_count,
  created_at
)
VALUES
  (6001, 1001, 'classify', 'completed', now() - interval '29 days', now() - interval '29 days' + interval '2 minutes', '{"document_type":"status_update"}'::jsonb, NULL, 0, now() - interval '29 days'),
  (6002, 1001, 'extract_entities', 'completed', now() - interval '29 days' + interval '3 minutes', now() - interval '29 days' + interval '6 minutes', '{"entities":["Pacific Packaging","6oz Sample Bottle","PO 4412"]}'::jsonb, NULL, 0, now() - interval '29 days'),
  (6003, 1006, 'resolve_entities', 'completed', now() - interval '2 days', now() - interval '2 days' + interval '90 seconds', '{"matched_partner":"BrightLabel Works","matched_sku":"Waterproof Label Set"}'::jsonb, NULL, 0, now() - interval '2 days'),
  (6004, 1007, 'extract_commitments', 'failed', now() - interval '1 days', NULL, NULL, 'Date phrase "three business days later" required fallback parser.', 1, now() - interval '1 days'),
  (6005, 1004, 'score_confidence', 'pending', NULL, NULL, NULL, NULL, 0, now() - interval '4 days')
ON CONFLICT (job_id) DO UPDATE
SET
  artifact_id = EXCLUDED.artifact_id,
  stage = EXCLUDED.stage,
  status = EXCLUDED.status,
  started_at = EXCLUDED.started_at,
  completed_at = EXCLUDED.completed_at,
  result = EXCLUDED.result,
  error = EXCLUDED.error,
  retry_count = EXCLUDED.retry_count,
  created_at = EXCLUDED.created_at;

INSERT INTO dash_private.commitment_events (
  event_id,
  commitment_id,
  seq,
  event_type,
  event_time,
  recorded_at,
  relationship_id,
  payload,
  evidence_span_ids,
  extractor,
  confidence,
  epistemic_class,
  idempotency_key
)
SELECT
  3001,
  '00000000-0000-0000-0000-000000000501',
  1,
  'created',
  CURRENT_DATE - INTERVAL '34 days',
  now(),
  '00000000-0000-0000-0000-000000000301',
  jsonb_build_object(
    'schema_version', 'v1',
    'sku', '6oz Sample Bottle',
    'partner_id', '00000000-0000-0000-0000-000000000101',
    'description', 'PO 4412 for 6oz sample bottles'
  ),
  ARRAY[2001],
  '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-501"}'::jsonb,
  NULL,
  'FACT',
  'seed:commitment:0501:seq1'
ON CONFLICT (event_id) DO UPDATE
SET
  seq = EXCLUDED.seq,
  event_type = EXCLUDED.event_type,
  event_time = EXCLUDED.event_time,
  recorded_at = EXCLUDED.recorded_at,
  relationship_id = EXCLUDED.relationship_id,
  payload = EXCLUDED.payload,
  evidence_span_ids = EXCLUDED.evidence_span_ids,
  extractor = EXCLUDED.extractor,
  confidence = EXCLUDED.confidence,
  epistemic_class = EXCLUDED.epistemic_class,
  idempotency_key = EXCLUDED.idempotency_key;

INSERT INTO dash_private.commitment_events VALUES
  (
    3002,
    '00000000-0000-0000-0000-000000000501',
    2,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '33 days',
    now(),
    '00000000-0000-0000-0000-000000000301',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 1200,
      'unit', 'units',
      'sku', '6oz Sample Bottle',
      'unit_price', 3.50,
      'currency', 'USD',
      'due_date', (CURRENT_DATE - INTERVAL '5 days')::date::text
    ),
    ARRAY[2001],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-501"}'::jsonb,
    0.97,
    'FACT_CANDIDATE',
    'seed:commitment:0501:seq2'
  ),
  (
    3003,
    '00000000-0000-0000-0000-000000000501',
    3,
    'milestone_set',
    CURRENT_DATE - INTERVAL '32 days',
    now(),
    '00000000-0000-0000-0000-000000000301',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'ship_date',
      'date', (CURRENT_DATE - INTERVAL '5 days')::date::text,
      'description', 'Initial committed ship date for PO 4412'
    ),
    ARRAY[2001],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-501"}'::jsonb,
    0.96,
    'FACT_CANDIDATE',
    'seed:commitment:0501:seq3'
  ),
  (
    3004,
    '00000000-0000-0000-0000-000000000502',
    1,
    'created',
    CURRENT_DATE - INTERVAL '12 days',
    now(),
    '00000000-0000-0000-0000-000000000305',
    jsonb_build_object(
      'schema_version', 'v1',
      'sku', 'Waterproof Label Set',
      'partner_id', '00000000-0000-0000-0000-000000000105',
      'description', 'Label run for spring retail reset'
    ),
    ARRAY[2006],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-502"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0502:seq1'
  ),
  (
    3005,
    '00000000-0000-0000-0000-000000000502',
    2,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '11 days',
    now(),
    '00000000-0000-0000-0000-000000000305',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 12500,
      'unit', 'sets',
      'sku', 'Waterproof Label Set',
      'unit_price', 0.42,
      'currency', 'USD',
      'due_date', CURRENT_DATE::text
    ),
    ARRAY[2006],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-502"}'::jsonb,
    0.95,
    'FACT_CANDIDATE',
    'seed:commitment:0502:seq2'
  ),
  (
    3006,
    '00000000-0000-0000-0000-000000000502',
    3,
    'milestone_set',
    CURRENT_DATE - INTERVAL '10 days',
    now(),
    '00000000-0000-0000-0000-000000000305',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'delivery_date',
      'date', (CURRENT_DATE - INTERVAL '2 days')::date::text,
      'description', 'Label delivery expected before invoice review'
    ),
    ARRAY[2006],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-502"}'::jsonb,
    0.93,
    'FACT_CANDIDATE',
    'seed:commitment:0502:seq3'
  ),
  (
    3007,
    '00000000-0000-0000-0000-000000000502',
    4,
    'invoice_issued',
    CURRENT_DATE - INTERVAL '2 days',
    now(),
    '00000000-0000-0000-0000-000000000305',
    jsonb_build_object(
      'schema_version', 'v1',
      'invoice_number', 'BL-2048',
      'amount', 5250.00,
      'currency', 'USD',
      'due_date', CURRENT_DATE::text,
      'line_items', jsonb_build_array(
        jsonb_build_object('sku', 'Waterproof Label Set', 'quantity', 12500, 'unit_price', 0.42)
      ),
      'terms', jsonb_build_object('payment_terms', 'Due on receipt')
    ),
    ARRAY[2006, 2009],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-invoice-502"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0502:seq4'
  ),
  (
    3008,
    '00000000-0000-0000-0000-000000000503',
    1,
    'created',
    CURRENT_DATE - INTERVAL '20 days',
    now(),
    '00000000-0000-0000-0000-000000000302',
    jsonb_build_object(
      'schema_version', 'v1',
      'sku', 'Lavender Body Wash 12oz',
      'partner_id', '00000000-0000-0000-0000-000000000102',
      'description', 'Lavender fragrance concentrate for April fill run'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-503"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0503:seq1'
  ),
  (
    3009,
    '00000000-0000-0000-0000-000000000503',
    2,
    'term_set',
    CURRENT_DATE - INTERVAL '19 days',
    now(),
    '00000000-0000-0000-0000-000000000302',
    jsonb_build_object(
      'schema_version', 'v1',
      'term_type', 'deposit',
      'value', '50 percent upfront',
      'unit', 'order'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-term-503"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0503:seq2'
  ),
  (
    3010,
    '00000000-0000-0000-0000-000000000503',
    3,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '18 days',
    now(),
    '00000000-0000-0000-0000-000000000302',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 300,
      'unit', 'kg',
      'sku', 'Lavender Body Wash 12oz',
      'unit_price', 18.00,
      'currency', 'USD',
      'due_date', (CURRENT_DATE + INTERVAL '20 days')::date::text
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-503"}'::jsonb,
    0.94,
    'FACT_CANDIDATE',
    'seed:commitment:0503:seq3'
  ),
  (
    3011,
    '00000000-0000-0000-0000-000000000503',
    4,
    'milestone_set',
    CURRENT_DATE - INTERVAL '17 days',
    now(),
    '00000000-0000-0000-0000-000000000302',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'release_date',
      'date', (CURRENT_DATE + INTERVAL '20 days')::date::text,
      'description', 'Fragrance release aligns to April production calendar'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-503"}'::jsonb,
    0.92,
    'FACT_CANDIDATE',
    'seed:commitment:0503:seq4'
  ),
  (
    3012,
    '00000000-0000-0000-0000-000000000503',
    5,
    'invoice_issued',
    CURRENT_DATE - INTERVAL '5 days',
    now(),
    '00000000-0000-0000-0000-000000000302',
    jsonb_build_object(
      'schema_version', 'v1',
      'invoice_number', 'CFL-881',
      'amount', 5400.00,
      'currency', 'USD',
      'due_date', (CURRENT_DATE + INTERVAL '10 days')::date::text,
      'line_items', jsonb_build_array(
        jsonb_build_object('sku', 'Lavender Body Wash 12oz', 'quantity', 300, 'unit_price', 18.00)
      ),
      'terms', jsonb_build_object('payment_terms', 'Net 15 after release')
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-invoice-503"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0503:seq5'
  ),
  (
    3013,
    '00000000-0000-0000-0000-000000000503',
    6,
    'payment_made',
    CURRENT_DATE - INTERVAL '1 days',
    now(),
    '00000000-0000-0000-0000-000000000302',
    jsonb_build_object(
      'schema_version', 'v1',
      'amount', 5400.00,
      'currency', 'USD',
      'method', 'stripe',
      'reference_id', 'pi_seed_503'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-payment-503"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0503:seq6'
  ),
  (
    3014,
    '00000000-0000-0000-0000-000000000504',
    1,
    'created',
    CURRENT_DATE - INTERVAL '9 days',
    now(),
    '00000000-0000-0000-0000-000000000306',
    jsonb_build_object(
      'schema_version', 'v1',
      'sku', 'Foaming Pump Cap',
      'partner_id', '00000000-0000-0000-0000-000000000106',
      'description', 'Pump cap replenishment for summer production'
    ),
    ARRAY[2007],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-504"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0504:seq1'
  ),
  (
    3015,
    '00000000-0000-0000-0000-000000000504',
    2,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '8 days',
    now(),
    '00000000-0000-0000-0000-000000000306',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 4000,
      'unit', 'caps',
      'sku', 'Foaming Pump Cap',
      'unit_price', 0.28,
      'currency', 'USD',
      'due_date', (CURRENT_DATE + INTERVAL '3 days')::date::text
    ),
    ARRAY[2007],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-504"}'::jsonb,
    0.91,
    'FACT_CANDIDATE',
    'seed:commitment:0504:seq2'
  ),
  (
    3016,
    '00000000-0000-0000-0000-000000000504',
    3,
    'milestone_set',
    CURRENT_DATE - INTERVAL '8 days',
    now(),
    '00000000-0000-0000-0000-000000000306',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'ship_date',
      'date', CURRENT_DATE::text,
      'description', 'Original ship date before tooling slip'
    ),
    ARRAY[2007],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-old-504"}'::jsonb,
    0.90,
    'FACT_CANDIDATE',
    'seed:commitment:0504:seq3'
  ),
  (
    3017,
    '00000000-0000-0000-0000-000000000504',
    4,
    'amended',
    CURRENT_DATE - INTERVAL '1 days',
    now(),
    '00000000-0000-0000-0000-000000000306',
    jsonb_build_object(
      'schema_version', 'v1',
      'field', 'ship_date',
      'old_value', CURRENT_DATE::text,
      'new_value', (CURRENT_DATE + INTERVAL '3 days')::date::text,
      'reason', 'Tooling adjustment on cap mold'
    ),
    ARRAY[2007],
    '{"name":"seed_loader","version":"milestone1","model":"claude-sonnet-seed","prompt_sha256":"seed-amended-504"}'::jsonb,
    0.78,
    'INFERENCE',
    'seed:commitment:0504:seq4'
  ),
  (
    3018,
    '00000000-0000-0000-0000-000000000504',
    5,
    'milestone_set',
    CURRENT_DATE - INTERVAL '1 days',
    now(),
    '00000000-0000-0000-0000-000000000306',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'ship_date',
      'date', (CURRENT_DATE + INTERVAL '3 days')::date::text,
      'description', 'Revised ship date after tooling adjustment'
    ),
    ARRAY[2007],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-new-504"}'::jsonb,
    0.89,
    'INFERENCE',
    'seed:commitment:0504:seq5'
  ),
  (
    3019,
    '00000000-0000-0000-0000-000000000505',
    1,
    'created',
    CURRENT_DATE - INTERVAL '25 days',
    now(),
    '00000000-0000-0000-0000-000000000307',
    jsonb_build_object(
      'schema_version', 'v1',
      'sku', 'Citrus Hand Soap 8oz',
      'partner_id', '00000000-0000-0000-0000-000000000107',
      'description', 'Carton run for citrus hand soap promo pack'
    ),
    ARRAY[2008],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-505"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0505:seq1'
  ),
  (
    3020,
    '00000000-0000-0000-0000-000000000505',
    2,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '24 days',
    now(),
    '00000000-0000-0000-0000-000000000307',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 5000,
      'unit', 'cartons',
      'sku', 'Citrus Hand Soap 8oz',
      'unit_price', 0.87,
      'currency', 'USD',
      'due_date', (CURRENT_DATE + INTERVAL '20 days')::date::text
    ),
    ARRAY[2008],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-505"}'::jsonb,
    0.92,
    'FACT_CANDIDATE',
    'seed:commitment:0505:seq2'
  ),
  (
    3021,
    '00000000-0000-0000-0000-000000000505',
    3,
    'milestone_set',
    CURRENT_DATE - INTERVAL '23 days',
    now(),
    '00000000-0000-0000-0000-000000000307',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'ship_date',
      'date', (CURRENT_DATE + INTERVAL '20 days')::date::text,
      'description', 'Carton release target after die-line approval'
    ),
    ARRAY[2008],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-505"}'::jsonb,
    0.91,
    'FACT_CANDIDATE',
    'seed:commitment:0505:seq3'
  ),
  (
    3022,
    '00000000-0000-0000-0000-000000000505',
    4,
    'cancelled',
    CURRENT_DATE - INTERVAL '4 days',
    now(),
    '00000000-0000-0000-0000-000000000307',
    jsonb_build_object(
      'schema_version', 'v1',
      'reason', 'Promo pack canceled after retailer shelf reset slipped',
      'cancellation_terms', jsonb_build_object('fee', 0, 'inventory_released', true)
    ),
    ARRAY[2008],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-cancelled-505"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0505:seq4'
  ),
  (
    3023,
    '00000000-0000-0000-0000-000000000506',
    1,
    'created',
    CURRENT_DATE - INTERVAL '6 days',
    now(),
    '00000000-0000-0000-0000-000000000304',
    jsonb_build_object(
      'schema_version', 'v1',
      'sku', 'Unscented Refill Pouch 32oz',
      'partner_id', '00000000-0000-0000-0000-000000000104',
      'description', 'Freight booking for refill pouch lane'
    ),
    ARRAY[2005],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-506"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0506:seq1'
  ),
  (
    3024,
    '00000000-0000-0000-0000-000000000506',
    2,
    'term_set',
    CURRENT_DATE - INTERVAL '6 days',
    now(),
    '00000000-0000-0000-0000-000000000304',
    jsonb_build_object(
      'schema_version', 'v1',
      'term_type', 'delivery_window',
      'value', '7 days from pickup',
      'unit', 'shipment'
    ),
    ARRAY[2005],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-term-506"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0506:seq2'
  ),
  (
    3025,
    '00000000-0000-0000-0000-000000000506',
    3,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '5 days',
    now(),
    '00000000-0000-0000-0000-000000000304',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 2400,
      'unit', 'pouches',
      'sku', 'Unscented Refill Pouch 32oz',
      'unit_price', 2.95,
      'currency', 'USD',
      'due_date', CURRENT_DATE::text
    ),
    ARRAY[2005],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-506"}'::jsonb,
    0.93,
    'FACT_CANDIDATE',
    'seed:commitment:0506:seq3'
  ),
  (
    3026,
    '00000000-0000-0000-0000-000000000506',
    4,
    'milestone_set',
    CURRENT_DATE - INTERVAL '5 days',
    now(),
    '00000000-0000-0000-0000-000000000304',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'pickup_date',
      'date', CURRENT_DATE::text,
      'description', 'Pickup booked for the refill pouch shipment'
    ),
    ARRAY[2005],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-506"}'::jsonb,
    0.92,
    'FACT_CANDIDATE',
    'seed:commitment:0506:seq4'
  ),
  (
    3027,
    '00000000-0000-0000-0000-000000000507',
    1,
    'created',
    CURRENT_DATE - INTERVAL '7 days',
    now(),
    '00000000-0000-0000-0000-000000000303',
    jsonb_build_object(
      'schema_version', 'v1',
      'sku', 'Travel Starter Kit',
      'partner_id', '00000000-0000-0000-0000-000000000103',
      'description', 'Starter kit receiving program at High Plains'
    ),
    ARRAY[2004],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-created-507"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0507:seq1'
  ),
  (
    3028,
    '00000000-0000-0000-0000-000000000507',
    2,
    'term_set',
    CURRENT_DATE - INTERVAL '7 days',
    now(),
    '00000000-0000-0000-0000-000000000303',
    jsonb_build_object(
      'schema_version', 'v1',
      'term_type', 'receiving_sla',
      'value', '48 hours from dock arrival',
      'unit', 'shipment'
    ),
    ARRAY[2004],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-term-507"}'::jsonb,
    NULL,
    'FACT',
    'seed:commitment:0507:seq2'
  ),
  (
    3029,
    '00000000-0000-0000-0000-000000000507',
    3,
    'quantity_committed',
    CURRENT_DATE - INTERVAL '6 days',
    now(),
    '00000000-0000-0000-0000-000000000303',
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 200,
      'unit', 'kits',
      'sku', 'Travel Starter Kit',
      'unit_price', 14.50,
      'currency', 'USD',
      'due_date', (CURRENT_DATE + INTERVAL '9 days')::date::text
    ),
    ARRAY[2004],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-quantity-507"}'::jsonb,
    0.92,
    'FACT_CANDIDATE',
    'seed:commitment:0507:seq3'
  ),
  (
    3030,
    '00000000-0000-0000-0000-000000000507',
    4,
    'milestone_set',
    CURRENT_DATE - INTERVAL '6 days',
    now(),
    '00000000-0000-0000-0000-000000000303',
    jsonb_build_object(
      'schema_version', 'v1',
      'milestone_type', 'dock_date',
      'date', (CURRENT_DATE + INTERVAL '9 days')::date::text,
      'description', 'Starter kits scheduled to dock at High Plains'
    ),
    ARRAY[2004],
    '{"name":"seed_loader","version":"milestone1","model":"claude-opus-seed","prompt_sha256":"seed-milestone-507"}'::jsonb,
    0.90,
    'FACT_CANDIDATE',
    'seed:commitment:0507:seq4'
  ),
  (
    3031,
    '00000000-0000-0000-0000-000000000507',
    5,
    'status_updated',
    CURRENT_DATE - INTERVAL '4 days',
    now(),
    '00000000-0000-0000-0000-000000000303',
    jsonb_build_object(
      'schema_version', 'v1',
      'from_status', 'inbound_expected',
      'to_status', 'inspection_hold',
      'reason', 'Dock report shows 20 kits damaged on arrival'
    ),
    ARRAY[2004, 2010],
    '{"name":"seed_loader","version":"milestone1","model":"claude-sonnet-seed","prompt_sha256":"seed-status-507"}'::jsonb,
    0.79,
    'INFERENCE',
    'seed:commitment:0507:seq5'
  )
ON CONFLICT (event_id) DO UPDATE
SET
  commitment_id = EXCLUDED.commitment_id,
  seq = EXCLUDED.seq,
  event_type = EXCLUDED.event_type,
  event_time = EXCLUDED.event_time,
  recorded_at = EXCLUDED.recorded_at,
  relationship_id = EXCLUDED.relationship_id,
  payload = EXCLUDED.payload,
  evidence_span_ids = EXCLUDED.evidence_span_ids,
  extractor = EXCLUDED.extractor,
  confidence = EXCLUDED.confidence,
  epistemic_class = EXCLUDED.epistemic_class,
  idempotency_key = EXCLUDED.idempotency_key;

INSERT INTO dash_private.fulfillment_events (
  event_id,
  commitment_id,
  seq,
  event_type,
  event_time,
  recorded_at,
  payload,
  evidence_span_ids,
  extractor,
  confidence,
  idempotency_key
)
VALUES
  (
    4001,
    '00000000-0000-0000-0000-000000000502',
    1,
    'received',
    CURRENT_DATE - INTERVAL '1 days',
    now(),
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 10000,
      'sku', 'Waterproof Label Set',
      'tracking_number', 'RCV-BL-10000',
      'carrier', 'Warehouse Receipt',
      'location', 'Reno 3PL'
    ),
    ARRAY[2006],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-fulfillment-502"}'::jsonb,
    NULL,
    'seed:fulfillment:0502:seq1'
  ),
  (
    4002,
    '00000000-0000-0000-0000-000000000503',
    1,
    'shipped',
    CURRENT_DATE - INTERVAL '4 days',
    now(),
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 300,
      'sku', 'Lavender Body Wash 12oz',
      'tracking_number', 'CFL-SHIP-300',
      'carrier', 'Canyon Freight Lines',
      'location', 'Chicago, IL'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-shipped-503"}'::jsonb,
    NULL,
    'seed:fulfillment:0503:seq1'
  ),
  (
    4003,
    '00000000-0000-0000-0000-000000000503',
    2,
    'received',
    CURRENT_DATE - INTERVAL '2 days',
    now(),
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 300,
      'sku', 'Lavender Body Wash 12oz',
      'tracking_number', 'CFL-SHIP-300',
      'carrier', 'Canyon Freight Lines',
      'location', 'Denver, CO'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-received-503"}'::jsonb,
    NULL,
    'seed:fulfillment:0503:seq2'
  ),
  (
    4004,
    '00000000-0000-0000-0000-000000000503',
    3,
    'delivered',
    CURRENT_DATE - INTERVAL '1 days',
    now(),
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 300,
      'sku', 'Lavender Body Wash 12oz',
      'tracking_number', 'CFL-SHIP-300',
      'carrier', 'Canyon Freight Lines',
      'location', 'Mozi Wash Production Floor'
    ),
    ARRAY[2003],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-delivered-503"}'::jsonb,
    NULL,
    'seed:fulfillment:0503:seq3'
  ),
  (
    4005,
    '00000000-0000-0000-0000-000000000507',
    1,
    'partial_received',
    CURRENT_DATE - INTERVAL '4 days',
    now(),
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 180,
      'sku', 'Travel Starter Kit',
      'tracking_number', 'HPF-KIT-180',
      'carrier', 'High Plains Fulfillment Internal',
      'location', 'Denver Dock 2'
    ),
    ARRAY[2004],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-partial-507"}'::jsonb,
    NULL,
    'seed:fulfillment:0507:seq1'
  ),
  (
    4006,
    '00000000-0000-0000-0000-000000000507',
    2,
    'returned',
    CURRENT_DATE - INTERVAL '2 days',
    now(),
    jsonb_build_object(
      'schema_version', 'v1',
      'quantity', 20,
      'sku', 'Travel Starter Kit',
      'tracking_number', 'HPF-RET-020',
      'carrier', 'Canyon Freight Lines',
      'location', 'Return lane to vendor'
    ),
    ARRAY[2010],
    '{"name":"seed_loader","version":"milestone1","model":"human_curated","prompt_sha256":"seed-returned-507"}'::jsonb,
    NULL,
    'seed:fulfillment:0507:seq2'
  )
ON CONFLICT (event_id) DO UPDATE
SET
  commitment_id = EXCLUDED.commitment_id,
  seq = EXCLUDED.seq,
  event_type = EXCLUDED.event_type,
  event_time = EXCLUDED.event_time,
  recorded_at = EXCLUDED.recorded_at,
  payload = EXCLUDED.payload,
  evidence_span_ids = EXCLUDED.evidence_span_ids,
  extractor = EXCLUDED.extractor,
  confidence = EXCLUDED.confidence,
  idempotency_key = EXCLUDED.idempotency_key;

INSERT INTO dash_private.review_events (
  event_id,
  target_event_id,
  target_table,
  decision,
  reviewer,
  notes,
  corrections,
  created_at
)
VALUES
  (7001, 3007, 'commitment_events', 'approved', 'matt@moziwash.com', 'Invoice matches the supplier email.', NULL, now() - interval '1 days'),
  (7002, 3031, 'commitment_events', 'rejected', 'ops@moziwash.com', 'Status wording should not escalate beyond the dock report.', '{"reason":"Need direct warehouse confirmation before treating as hard status."}'::jsonb, now() - interval '3 hours'),
  (7003, 3017, 'commitment_events', 'amended', 'matt@moziwash.com', 'Updated the revised ship date after phone confirmation.', '{"field":"new_value","value":""}'::jsonb || jsonb_build_object('value', (CURRENT_DATE + INTERVAL '3 days')::date::text), now() - interval '2 hours')
ON CONFLICT (event_id) DO UPDATE
SET
  target_event_id = EXCLUDED.target_event_id,
  target_table = EXCLUDED.target_table,
  decision = EXCLUDED.decision,
  reviewer = EXCLUDED.reviewer,
  notes = EXCLUDED.notes,
  corrections = EXCLUDED.corrections,
  created_at = EXCLUDED.created_at;

INSERT INTO action_runs (
  action_run_id,
  action_type,
  commitment_id,
  requested_by,
  status,
  idempotency_key,
  request_payload,
  provider_response,
  provider_object_id,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000601',
    'gmail_draft_create',
    '00000000-0000-0000-0000-000000000501',
    'matt@moziwash.com',
    'requested',
    'seed:action:request-update:0501',
    '{"to":"sarah@pacificpackaging.com","subject":"PO 4412 tracking request","body":"Can you send tracking for the 6oz sample bottles?"}'::jsonb,
    NULL,
    NULL,
    now() - interval '1 hours',
    now() - interval '1 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000602',
    'gmail_draft_create',
    '00000000-0000-0000-0000-000000000502',
    'matt@moziwash.com',
    'succeeded',
    'seed:action:dispute-invoice:0502',
    '{"to":"priya@brightlabel.com","subject":"Invoice BL-2048 discrepancy","body":"We received 10,000 of 12,500 labels. Please review the invoice."}'::jsonb,
    '{"draft_id":"draft_seed_602"}'::jsonb,
    'draft_seed_602',
    now() - interval '30 minutes',
    now() - interval '20 minutes'
  )
ON CONFLICT (action_run_id) DO UPDATE
SET
  action_type = EXCLUDED.action_type,
  commitment_id = EXCLUDED.commitment_id,
  requested_by = EXCLUDED.requested_by,
  status = EXCLUDED.status,
  idempotency_key = EXCLUDED.idempotency_key,
  request_payload = EXCLUDED.request_payload,
  provider_response = EXCLUDED.provider_response,
  provider_object_id = EXCLUDED.provider_object_id,
  updated_at = EXCLUDED.updated_at;

INSERT INTO action_outbox (
  outbox_id,
  action_run_id,
  available_at,
  attempts,
  max_attempts,
  locked_at,
  status,
  created_at
)
VALUES
  (8001, '00000000-0000-0000-0000-000000000601', now() - interval '1 hours', 0, 5, NULL, 'pending', now() - interval '1 hours'),
  (8002, '00000000-0000-0000-0000-000000000602', now() - interval '25 minutes', 1, 5, now() - interval '24 minutes', 'done', now() - interval '30 minutes')
ON CONFLICT (outbox_id) DO UPDATE
SET
  action_run_id = EXCLUDED.action_run_id,
  available_at = EXCLUDED.available_at,
  attempts = EXCLUDED.attempts,
  max_attempts = EXCLUDED.max_attempts,
  locked_at = EXCLUDED.locked_at,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at;

SELECT setval(pg_get_serial_sequence('artifacts', 'artifact_id'), COALESCE((SELECT max(artifact_id) FROM artifacts), 1), true);
SELECT setval(pg_get_serial_sequence('evidence_spans', 'evidence_span_id'), COALESCE((SELECT max(evidence_span_id) FROM evidence_spans), 1), true);
SELECT setval(pg_get_serial_sequence('communications', 'communication_id'), COALESCE((SELECT max(communication_id) FROM communications), 1), true);
SELECT setval(pg_get_serial_sequence('processing_jobs', 'job_id'), COALESCE((SELECT max(job_id) FROM processing_jobs), 1), true);
SELECT setval(pg_get_serial_sequence('action_outbox', 'outbox_id'), COALESCE((SELECT max(outbox_id) FROM action_outbox), 1), true);
SELECT setval(pg_get_serial_sequence('dash_private.commitment_events', 'event_id'), COALESCE((SELECT max(event_id) FROM dash_private.commitment_events), 1), true);
SELECT setval(pg_get_serial_sequence('dash_private.fulfillment_events', 'event_id'), COALESCE((SELECT max(event_id) FROM dash_private.fulfillment_events), 1), true);
SELECT setval(pg_get_serial_sequence('dash_private.review_events', 'event_id'), COALESCE((SELECT max(event_id) FROM dash_private.review_events), 1), true);

REFRESH MATERIALIZED VIEW public.commitment_current_state;
REFRESH MATERIALIZED VIEW public.reconciliation;
REFRESH MATERIALIZED VIEW public.daily_driver;

COMMIT;

-- VALIDATION 1: All four temporal buckets populated
-- SELECT temporal_bucket, count(*) FROM daily_driver GROUP BY temporal_bucket;

-- VALIDATION 2: Reconciliation discrepancy exists
-- SELECT * FROM reconciliation WHERE shortfall > 0;

-- VALIDATION 3: "6oz sample bottles" answerable
-- SELECT s.name, ce.* FROM dash_private.commitment_events ce
--   JOIN relationships r ON r.relationship_id = ce.relationship_id
--   JOIN skus s ON s.normalized_name = '6oz sample bottle'
--   WHERE ce.payload->>'sku' = '6oz Sample Bottle';

-- VALIDATION 4: Every event_type exercised
-- SELECT event_type, count(*) FROM dash_private.commitment_events GROUP BY event_type;
-- SELECT event_type, count(*) FROM dash_private.fulfillment_events GROUP BY event_type;

-- VALIDATION 5: Evidence chain intact
-- SELECT ce.commitment_id, ce.evidence_span_ids, es.extracted_text
--   FROM dash_private.commitment_events ce
--   CROSS JOIN LATERAL unnest(ce.evidence_span_ids) AS span_id
--   JOIN evidence_spans es ON es.evidence_span_id = span_id
--   LIMIT 10;

-- VALIDATION 6: Anomaly detection
-- SELECT * FROM daily_driver WHERE is_anomaly = true;
