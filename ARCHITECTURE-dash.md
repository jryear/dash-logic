# Dash — Architectural Specification

> This document is prescriptive. Every section states what to build, why, and how. Builders implement the decisions described here — they do not make new architectural decisions without updating this spec first.

---

## 1. What Dash Is

An operational intelligence layer for scaling product brands. Dash ingests every communication, document, and transaction across a brand's supplier network and becomes the single source of truth that both answers questions and anticipates problems.

Built for Matt (Mozi Wash) as design partner. Not a prototype. A production V1.

**The product thesis:** Matt doesn't want a dashboard. He wants to talk to his ops person who quit. "Where are my 6oz sample bottles?" → Dash traces across the commitment ledger, finds the PO, the last email, the invoice terms, the fulfillment timeline, and assembles a contextual answer with source attribution.

**The amplification thesis:** Dash doesn't replace the ops person. It eliminates the hours spent reconstructing context from fragmented sources. The ops person (or founder acting as one) opens Dash and has institutional memory from minute one. They spend their time on negotiation, prospecting, and exception handling — not on digging through Gmail.

---

## 2. Core Architectural Bet

**Commitments are the atom.** A relationship is the namespace — the container that gives context. What we track is the irreducible unit of operational truth:

- **Who** committed (supplier, manufacturer, 3PL, freight partner)
- **To what** (quantity, specification, SKU)
- **By when** (milestone, date, deadline)
- **Under what gate** (deposit, acceptance terms, conditions)
- **With what evidence** (email, PDF, invoice, PO)
- **What changed since** (event log, amendments, delays)

Every order, payment, shipment, and communication resolves to one or more commitments. The relationship graph provides context. The commitment ledger provides truth.

**Why event sourcing is non-negotiable:** Every commitment carries its full evidence chain. Every change is an immutable event. The system can always answer "who said what, when, and has anything changed since?" This is the moat — without it, trust engineering is impossible.

---

## 3. Trust Engineering

**Why this section exists first:** One confident wrong answer — "arrives Thursday" when it actually shipped late — and Matt never trusts Dash again. Trust is not UX polish. Trust is the product.

### 3.1 The Epistemological Model

Every data point Dash surfaces falls into exactly one of three categories:

| Category | Definition | Example | UI Expression |
|---|---|---|---|
| **Fact** | Explicit, sourced, grounded in artifact. Carries source attribution and timestamp. | Carrier tracking says in-transit. Invoice PDF states Net 30. Supplier email says "shipped Jan 15." | Definitive language: "shipped Jan 15," "invoice states $4,200" |
| **Inference** | Derived, probabilistic, synthesized across sources. Carries confidence level, reasoning chain, and source list. | "Based on ship date and carrier average, arrival likely Thursday." | Qualified language: "likely," "based on," "estimated" |
| **Unknown** | Missing data that Dash knows it doesn't have. Surfaces as explicit gap, never as silence. | No tracking number found. No response to last follow-up. Payment terms not yet extracted. | Explicit gap: "No tracking data found. Last communication was 12 days ago." + action button |

### 3.2 The Rule

Dash refuses to speak in finals unless the underlying data is a grounded Fact. When it infers, it says so. When it doesn't know, it says that too. This is enforced at the **response schema level** (validated structured output), not as a UI convention.

### 3.3 UI Expression of Epistemology

**Critical:** Matt never sees the words "Fact," "Inference," or "Unknown." He never sees confidence percentages. The epistemology is expressed through **language** and **actions**:

- Facts → definitive phrasing, no hedging
- Inferences → qualified phrasing ("likely," "estimated," "based on")
- Unknowns → explicit gaps with action buttons ("No tracking found. [Request Update]")

The complexity is absorbed by the system, not delegated to the user.

---

## 4. Domain Model

### 4.1 Core Entities

| Entity | Description | Source |
|---|---|---|
| **Partner** | A supplier, manufacturer, 3PL, freight company, or any external party Matt does business with | Extracted from email domains, document headers, PO counterparties |
| **Contact** | A person at a partner organization | Extracted from email addresses, signatures, CC fields |
| **Relationship** | The namespace connecting Matt's brand to a partner. Contains negotiated terms, communication history, payment history | Derived from partner + communication patterns |
| **Commitment** | The atom. A specific promise between parties — quantity, spec, deadline, gate, evidence | Extracted from POs, invoices, emails, contracts |
| **SKU** | A product identifier that spans across multiple partners and commitments | Extracted from POs, invoices, inventory reports, email references |
| **Artifact** | A raw document or communication ingested by Dash — email, PDF, spreadsheet, attachment | Gmail API, Drive API, Sheets API |
| **Evidence Span** | A specific passage within an artifact that supports a claim | Extracted during pipeline processing |

### 4.2 The Reconciliation Model

**Why this exists:** Matt had 12,500 bottles committed on a PO. 10,000 arrived. Invoice billed for 12,500. Nobody caught the 2,500-unit discrepancy for weeks. This cost real money and damaged the supplier relationship.

The architecture explicitly models **commitments vs. actuals**:

- **Commitment events** track what was promised (PO says 12,500 units by Feb 15)
- **Fulfillment events** track what actually happened (warehouse receipt says 10,000 units received Feb 18)
- **Reconciliation projections** continuously compare committed vs. fulfilled and fire anomaly events when discrepancies are detected

This is not a reporting feature. It's a first-class domain concept. The daily driver surfaces discrepancies the morning they're detected — not weeks later when distribution matters.

**Discrepancy types the system must detect:**
- Quantity shortfall (received < committed)
- Quantity overage (received > committed)
- Timeline slip (fulfilled after committed date)
- Specification mismatch (wrong SKU, wrong variant)
- Invoice/fulfillment mismatch (billed amount ≠ received value)
- Communication gap (no response from supplier beyond threshold)

---

## 5. Technical Stack

### 5.1 The Stack (Final)

| Layer | Choice | Reasoning |
|---|---|---|
| **Database** | PostgreSQL on Supabase | Single platform: auth, realtime, storage, database. Standard Postgres — portable if we outgrow Supabase. No separate event store, no separate graph DB. |
| **Event Store** | Append-only table in Postgres | Commitment events and fulfillment events are immutable. Current state derived from materialized projections. Temporal queries native from the event stream. |
| **Graph Traversal** | Recursive CTEs on adjacency tables | Our graph is wide and shallow (max 4-5 hops). Recursive CTEs handle this cleanly. No Neo4j, no Apache AGE. Adjacency lists with well-indexed foreign keys. |
| **Vector Search** | None for V1 | Matt's queries are entity-oriented, not semantic. V1 retrieval uses three deterministic primitives: entity resolution (canonical IDs), full-text search (tsvector + GIN on evidence spans), and fuzzy matching (pg_trgm on entity names). Add pgvector when real queries demand it — the extension enables on existing Supabase Postgres without migration. |
| **Extraction Pipeline** | Inngest + Anthropic API | Staged extraction with retries, concurrency control, observability. Idempotency guaranteed by data model (idempotency keys on events), not by orchestration framework. |
| **Query Intelligence** | Claude decomposition → Postgres → Claude synthesis | Single pipeline. No routing layer, no vector tier. Claude decomposes natural language to structured intent, Postgres executes, Claude composes response with epistemological tagging. |
| **Frontend** | Next.js 15 App Router + React Server Components | Read-heavy intelligence surface. Server-rendered daily driver. Streamed command bar responses. No client-side state management library. |
| **Hosting** | Vercel | Edge functions for command bar. Server functions for query assembly. Zero-config deployment. Use Supabase transaction-mode pooler for all serverless DB connections (disable prepared statements in client library). |
| **Background Jobs** | Inngest | Extraction workers, reconciliation checks, email webhook processing, Gmail watch renewal (scheduled daily). Retries and concurrency built in. |
| **Artifact Storage** | Supabase Storage + offsite backup | Content-addressable keys (SHA-256 hash). Write-once, never overwrite, never delete. Nightly offsite copy to secondary bucket (R2 or GCS) because Supabase DB backups do not include Storage objects and Supabase Storage does not support S3 versioning — deletions are permanent. |
| **LLM** | Anthropic API direct | Sonnet for high-volume extraction stages (classification, entity extraction). Opus for high-stakes stages (commitment extraction, answer generation). Structured outputs validated via Zod before ledger mutation. |
| **Auth** | Supabase Auth | Google OAuth for Workspace connection. Session management handled by Supabase. |
| **Realtime** | Supabase Realtime | Push commitment status changes and anomaly detections to frontend without polling. |
| **Email Actions** | Gmail API (send as user) | Follow-ups and dispute emails sent from Matt's Gmail, not from a Dash address. Maintains relationship authenticity. Sent emails ingested back as communication events. |
| **Payments** | Stripe | Payment execution for supplier invoices. Transaction ID recorded as immutable event with evidence. |

### 5.2 What's Deliberately Absent and Why

| Excluded | Why |
|---|---|
| **pgvector / embeddings** | Queries are entity-oriented. Claude handles query decomposition. Add when structured lookup demonstrably fails on real queries. Two-way door. |
| **Neo4j / Apache AGE** | Graph is wide and shallow (4-5 hops max, 10-50 suppliers). Recursive CTEs handle this. Adjacency lists outperform at this scale. |
| **Kafka / EventStoreDB** | Append-only Postgres table is the entire event store. Write volume (hundreds of events/month) is trivial for Postgres. |
| **Temporal / Airflow** | Replayability comes from the data model (immutable artifacts + idempotency keys + extractor versioning), not from the orchestration layer. Inngest provides sufficient retry/concurrency. |
| **LangChain / LlamaIndex** | We need transparency and auditability in extraction, not abstraction. Thin Anthropic API wrapper with structured output schemas. |
| **Redux / Zustand** | Read-heavy intelligence surface. Server Components + Supabase Realtime + URL state for filters. No client-side state monster. |
| **Microservices** | One API service. Pipeline stages are logical, not deployment boundaries. Split only if a specific stage needs independent scaling. |
| **Separate vector database** | pgvector on the same Postgres instance when needed. One database, one operational surface. |

### 5.3 One-Way Doors (Irreversible Commitments)

These are the decisions that shape everything downstream and cannot be easily reversed:

1. **Commitment-centric data model** — the atom is a commitment, not a transaction or a contact
2. **Event sourcing** — append-only, immutable events as the source of truth
3. **Fact/Inference/Unknown epistemology** — enforced at schema level, not UI level
4. **Reconciliation as first-class domain concept** — commitments vs. actuals, not just milestone tracking

### 5.4 Two-Way Doors (Swappable Without Architectural Change)

1. Supabase → self-hosted Postgres or Cloud SQL (standard Postgres underneath)
2. Inngest → Temporal (if HITL gating needs durable workflow state)
3. No embeddings → pgvector (extension enables on same instance)
4. Vercel → any Node.js hosting (standard Next.js)
5. Embedding model choice (OpenAI vs Anthropic vs open-source)
6. LLM model versions (Sonnet/Opus versions upgrade without schema change)

### 5.5 Operational Hardening (Non-Negotiable)

**Append-only enforcement at DB level, not convention.** Application roles on event tables (commitment_events, fulfillment_events, review_events) are restricted to SELECT and INSERT only. No UPDATE, no DELETE. This is enforced via Postgres role privileges, not application logic. An application bug or bad migration cannot corrupt the ledger. Event tables live in a private schema; the Data API exposes only safe read views and RPCs.

**Payload validation at DB boundary.** Use pg_jsonschema CHECK constraints on commitment_events.payload and fulfillment_events.payload so that each event_type + schema_version combination must match a known JSON Schema. Malformed data cannot enter the ledger even if the application layer has a bug.

**Artifact durability.** Supabase DB backups do not include objects stored via the Storage API. Supabase Storage does not support S3 versioning — deleted objects are permanently removed. Two rules enforced: (1) write-once object keys with content hash in path, no overwrite operations, no delete operations exposed to application code, (2) nightly offsite backup of all artifacts to a secondary storage provider. Logical deletion handled via tombstone records in DB metadata, never via object deletion.

**Realtime is a UI refresh channel, not a truth mechanism.** Supabase Realtime pushes notifications to the frontend for UI invalidation. The frontend always queries the ledger for truth. If realtime delivery fails, the UI is stale but the data is correct. Correctness never depends on realtime delivery.

---

## 6. Schema Design

### 6.1 Core Tables

```sql
-- ============================================================
-- ARTIFACTS: Raw ingested documents and communications
-- ============================================================
CREATE TABLE artifacts (
  artifact_id          bigserial PRIMARY KEY,
  source_system        text NOT NULL,                -- gmail | drive | sheets
  source_locator       text NOT NULL,                -- messageId, fileId, etc.
  source_revision      text NULL,                    -- drive revisionId, etc.
  content_sha256       bytea NOT NULL,               -- content-addressable dedup
  mime_type            text NOT NULL,
  storage_uri          text NOT NULL,                -- supabase storage path
  captured_at          timestamptz NOT NULL DEFAULT now(),
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_system, source_locator, COALESCE(source_revision, '')),
  UNIQUE (content_sha256)
);
CREATE INDEX artifacts_source_idx ON artifacts (source_system, source_locator);

-- ============================================================
-- EVIDENCE SPANS: Specific passages within artifacts that support claims
-- ============================================================
CREATE TABLE evidence_spans (
  evidence_span_id     bigserial PRIMARY KEY,
  artifact_id          bigint NOT NULL REFERENCES artifacts(artifact_id),
  locator              jsonb NOT NULL,               -- {"page":2,"bbox":[...]} or {"char_start":123,"char_end":456}
  extracted_text       text NOT NULL,                -- exact snippet used as evidence
  snippet_sha256       bytea NOT NULL,
  fts                  tsvector GENERATED ALWAYS AS (to_tsvector('english', extracted_text)) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, snippet_sha256)
);
CREATE INDEX evidence_spans_fts_idx ON evidence_spans USING GIN (fts);

-- ============================================================
-- ENTITIES: Partners, contacts, SKUs
-- ============================================================
CREATE TABLE partners (
  partner_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  normalized_name      text NOT NULL,                -- lowercase, trimmed for matching
  domain               text NULL,                    -- email domain for resolution
  partner_type         text NOT NULL,                -- supplier | manufacturer | 3pl | freight | packaging
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partners_domain_idx ON partners (domain);
CREATE INDEX partners_normalized_idx ON partners (normalized_name);
CREATE INDEX partners_name_trgm_idx ON partners USING GIN (name gin_trgm_ops);

CREATE TABLE contacts (
  contact_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid NOT NULL REFERENCES partners(partner_id),
  name                 text NOT NULL,
  email                text NULL,
  phone                text NULL,
  role                 text NULL,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_email_idx ON contacts (email);

CREATE TABLE skus (
  sku_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  normalized_name      text NOT NULL,                -- lowercase, trimmed for entity resolution
  variants             text[] NOT NULL DEFAULT '{}', -- alternate names found in documents
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skus_normalized_idx ON skus (normalized_name);
CREATE INDEX skus_variants_idx ON skus USING GIN (variants);
CREATE INDEX skus_name_trgm_idx ON skus USING GIN (name gin_trgm_ops);

-- ============================================================
-- RELATIONSHIPS: The namespace connecting brand to partner
-- ============================================================
CREATE TABLE relationships (
  relationship_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid NOT NULL REFERENCES partners(partner_id),
  status               text NOT NULL DEFAULT 'active',  -- active | inactive | onboarding
  negotiated_terms     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- payment terms, lead times, MOQs
  terms_evidence       bigint[] NOT NULL DEFAULT '{}',      -- evidence_span_ids supporting terms
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- COMMITMENT EVENTS: The truth core (append-only, immutable)
-- ============================================================
CREATE TABLE commitment_events (
  event_id             bigserial PRIMARY KEY,
  commitment_id        uuid NOT NULL,                -- stream id (groups events for one commitment)
  seq                  integer NOT NULL,             -- monotonic per commitment_id
  event_type           text NOT NULL,                -- created | term_set | milestone_set | status_updated | quantity_committed | amended | cancelled
  event_time           timestamptz NOT NULL,         -- when it happened in the real world
  recorded_at          timestamptz NOT NULL DEFAULT now(),  -- when Dash recorded it
  relationship_id      uuid NOT NULL REFERENCES relationships(relationship_id),
  payload              jsonb NOT NULL,               -- schema-versioned event payload
  evidence_span_ids    bigint[] NOT NULL DEFAULT '{}',
  extractor            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"name":"...","version":"...","model":"...","prompt_sha256":"..."}
  confidence           double precision NULL,        -- extractor confidence (NULL for human-entered)
  epistemic_class      text NOT NULL DEFAULT 'FACT_CANDIDATE',  -- FACT | FACT_CANDIDATE | INFERENCE | UNKNOWN
  idempotency_key      text NOT NULL,                -- sha256(artifact_id + extractor_version + payload_hash)
  UNIQUE (commitment_id, seq),
  UNIQUE (idempotency_key)
);
CREATE INDEX commitment_events_stream_idx ON commitment_events (commitment_id, seq DESC);
CREATE INDEX commitment_events_time_idx ON commitment_events (event_time DESC);
CREATE INDEX commitment_events_relationship_idx ON commitment_events (relationship_id);
CREATE INDEX commitment_events_type_idx ON commitment_events (event_type);
CREATE INDEX commitment_events_payload_gin ON commitment_events USING GIN (payload);

-- ============================================================
-- FULFILLMENT EVENTS: What actually happened (append-only, immutable)
-- ============================================================
CREATE TABLE fulfillment_events (
  event_id             bigserial PRIMARY KEY,
  commitment_id        uuid NOT NULL,                -- links to the commitment being fulfilled
  seq                  integer NOT NULL,
  event_type           text NOT NULL,                -- shipped | received | delivered | returned | partial_received
  event_time           timestamptz NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  payload              jsonb NOT NULL,               -- {"quantity_received": 10000, "sku": "...", "tracking": "..."}
  evidence_span_ids    bigint[] NOT NULL DEFAULT '{}',
  extractor            jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence           double precision NULL,
  idempotency_key      text NOT NULL,
  UNIQUE (commitment_id, seq),
  UNIQUE (idempotency_key)
);
CREATE INDEX fulfillment_events_stream_idx ON fulfillment_events (commitment_id, seq DESC);
CREATE INDEX fulfillment_events_time_idx ON fulfillment_events (event_time DESC);

-- ============================================================
-- HUMAN REVIEW EVENTS: HITL decisions (append-only, immutable)
-- ============================================================
CREATE TABLE review_events (
  event_id             bigserial PRIMARY KEY,
  target_event_id      bigint NOT NULL,              -- the commitment/fulfillment event being reviewed
  target_table         text NOT NULL,                -- 'commitment_events' | 'fulfillment_events'
  decision             text NOT NULL,                -- approved | rejected | amended
  reviewer             text NOT NULL,                -- user identifier
  notes                text NULL,
  corrections          jsonb NULL,                   -- if amended, what changed
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- COMMUNICATIONS: Email threads and messages linked to relationships
-- ============================================================
CREATE TABLE communications (
  communication_id     bigserial PRIMARY KEY,
  artifact_id          bigint NOT NULL REFERENCES artifacts(artifact_id),
  relationship_id      uuid REFERENCES relationships(relationship_id),
  contact_id           uuid REFERENCES contacts(contact_id),
  direction            text NOT NULL,                -- inbound | outbound
  subject              text NULL,
  summary              text NULL,                    -- AI-generated summary
  communication_date   timestamptz NOT NULL,
  thread_id            text NULL,                    -- Gmail thread ID for grouping
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX communications_relationship_idx ON communications (relationship_id, communication_date DESC);
CREATE INDEX communications_thread_idx ON communications (thread_id);

-- ============================================================
-- PROCESSING JOBS: Extraction pipeline tracking
-- ============================================================
CREATE TABLE processing_jobs (
  job_id               bigserial PRIMARY KEY,
  artifact_id          bigint NOT NULL REFERENCES artifacts(artifact_id),
  stage                text NOT NULL,                -- classify | extract_entities | resolve_entities | extract_commitments | score_confidence
  status               text NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed | skipped
  started_at           timestamptz NULL,
  completed_at         timestamptz NULL,
  result               jsonb NULL,
  error                text NULL,
  retry_count          integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX processing_jobs_status_idx ON processing_jobs (status, created_at);

-- ============================================================
-- REQUIRED EXTENSIONS
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy entity matching
-- CREATE EXTENSION IF NOT EXISTS pg_jsonschema; -- payload validation via CHECK constraints

-- ============================================================
-- ACTION OUTBOX: Reliable side-effect execution (Gmail, Stripe)
-- ============================================================
-- Solves the dual-write problem: ledger event + external side-effect
-- must both succeed or neither. Write both in one Postgres transaction,
-- then a worker processes outbox records and calls external providers.
CREATE TABLE action_runs (
  action_run_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type          text NOT NULL,                -- gmail_draft_create | gmail_draft_send | stripe_payment_create
  commitment_id        uuid NULL,                    -- linked commitment (if applicable)
  requested_by         text NOT NULL,                -- user identifier
  status               text NOT NULL DEFAULT 'requested',  -- requested | in_progress | succeeded | failed
  idempotency_key      text NOT NULL,                -- provider-level idempotency key (Stripe requires this)
  request_payload      jsonb NOT NULL,               -- what to send to the provider
  provider_response    jsonb NULL,                   -- raw response from provider
  provider_object_id   text NULL,                    -- messageId, draftId, paymentIntentId, etc.
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE action_outbox (
  outbox_id            bigserial PRIMARY KEY,
  action_run_id        uuid NOT NULL REFERENCES action_runs(action_run_id),
  available_at         timestamptz NOT NULL DEFAULT now(),
  attempts             integer NOT NULL DEFAULT 0,
  max_attempts         integer NOT NULL DEFAULT 5,
  locked_at            timestamptz NULL,
  status               text NOT NULL DEFAULT 'pending',  -- pending | locked | done | dead
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_outbox_pending_idx ON action_outbox (status, available_at);
```

### 6.2 Materialized Projections (Derived from Events)

These are rebuilt from events and serve as read-optimized views for the frontend.

```sql
-- Current state of each commitment (latest event wins)
CREATE MATERIALIZED VIEW commitment_current_state AS
SELECT DISTINCT ON (commitment_id)
  commitment_id,
  relationship_id,
  event_type AS current_status,
  event_time AS last_event_time,
  payload AS current_payload,
  confidence,
  epistemic_class
FROM commitment_events
ORDER BY commitment_id, seq DESC;

-- Reconciliation: committed vs fulfilled per commitment
CREATE MATERIALIZED VIEW reconciliation AS
SELECT
  ce.commitment_id,
  ce.relationship_id,
  (ce.payload->>'quantity')::integer AS committed_quantity,
  COALESCE(SUM((fe.payload->>'quantity_received')::integer), 0) AS fulfilled_quantity,
  (ce.payload->>'quantity')::integer - COALESCE(SUM((fe.payload->>'quantity_received')::integer), 0) AS shortfall,
  ce.payload->>'sku' AS sku,
  ce.payload->>'amount' AS committed_amount
FROM commitment_events ce
LEFT JOIN fulfillment_events fe ON fe.commitment_id = ce.commitment_id
WHERE ce.event_type = 'quantity_committed'
GROUP BY ce.commitment_id, ce.relationship_id, ce.payload;

-- Daily driver: temporal attention view
CREATE MATERIALIZED VIEW daily_driver AS
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
    WHEN cs.current_payload->>'due_date' IS NOT NULL
      AND (cs.current_payload->>'due_date')::date < CURRENT_DATE THEN 'overdue'
    WHEN cs.current_payload->>'due_date' IS NOT NULL
      AND (cs.current_payload->>'due_date')::date = CURRENT_DATE THEN 'today'
    WHEN cs.current_payload->>'due_date' IS NOT NULL
      AND (cs.current_payload->>'due_date')::date <= CURRENT_DATE + INTERVAL '7 days' THEN 'this_week'
    ELSE 'later'
  END AS temporal_bucket
FROM commitment_current_state cs
JOIN relationships rel ON rel.relationship_id = cs.relationship_id
JOIN partners p ON p.partner_id = rel.partner_id
LEFT JOIN reconciliation r ON r.commitment_id = cs.commitment_id;
```

### 6.3 Confidence Gating Policy

| Overall Confidence | Required Field Confidence | Evidence Spans | Action |
|---|---|---|---|
| ≥ 0.90 | All required fields ≥ 0.85 | ≥ 1 per required field | **Auto-write** to ledger as FACT_CANDIDATE |
| 0.70 – 0.89 | Any required field 0.60 – 0.84 | At least 1 total | **HITL queue** — surface for user confirmation |
| < 0.70 | Any required field < 0.60 | 0 or insufficient | **Candidate only** — store but do not surface as truth |

Human confirmation promotes FACT_CANDIDATE → FACT. Human rejection records an immutable rejection event.

These thresholds are starting points. Calibrate against Matt's real data during Phase 2.

---

## 7. Extraction Pipeline

### 7.1 Pipeline Stages

Every raw artifact flows through these stages sequentially. Each stage is independently testable, cacheable, and debuggable.

```
Artifact Ingested
  → Stage 1: Classification
  → Stage 2: Entity Extraction
  → Stage 3: Entity Resolution
  → Stage 4: Commitment Extraction
  → Stage 5: Conflict Resolution
  → Stage 6: Confidence Scoring & Event Emission
```

### 7.2 Stage Details

**Stage 1 — Classification**
- Input: Raw artifact (email, PDF, spreadsheet)
- Output: Document type (PO, invoice, contract, status_update, negotiation, check_in, noise)
- LLM: Sonnet (cheap, fast, high accuracy for routing)
- Purpose: Determines downstream handling. A PO gets structured field extraction. A casual email gets relationship-linking and context tagging.

**Stage 2 — Entity Extraction**
- Input: Classified artifact
- Output: Provisional entities (partner names, contact info, SKUs, quantities, dates, dollar amounts)
- LLM: Sonnet with structured output schema
- Purpose: Extract nouns and numbers. Not comprehension — identification.

**Stage 3 — Entity Resolution**
- Input: Provisional entities
- Output: Resolved entities linked to existing graph, or new entities flagged for creation
- Method: Fuzzy matching against existing partners/contacts/SKUs in Postgres. Email domain matching. Contact association. Trigram similarity via pg_trgm.
- Critical rule: When confidence is below threshold, flag for user confirmation. Never auto-merge ambiguous entities.
- LLM: Not needed for most resolution. Sonnet for ambiguous cases only.

**Stage 4 — Commitment Extraction**
- Input: Resolved entities + classified artifact
- Output: Structured commitment proposals with evidence spans
- LLM: **Opus** — this is the highest-stakes extraction. Must distinguish between hard commitments ("ships Jan 15"), soft commitments ("should be there by Friday"), conditional commitments ("ships once deposit clears"), and non-commitments ("we're working on it").
- Output schema: `{committer, commitment_type, spec, quantity, deadline, gate, evidence_spans[], confidence}`
- Purpose: This is where trust engineering lives at the data layer.

**Stage 5 — Conflict Resolution**
- Input: New commitment proposal + existing commitment events on the ledger
- Output: Resolution decision (new event supersedes, conflicts flagged, no change)
- Rule: Most recent signal with highest specificity wins for current state projection. Both events remain on the ledger. Full history preserved.
- Example: PO says ship Jan 15. Email from Jan 20 says delayed to Jan 25. Both events exist. Current state projection shows Jan 25 with amendment history.

**Stage 6 — Confidence Scoring & Event Emission**
- Input: Validated commitment proposal with conflict resolution
- Output: Immutable event(s) on the commitment ledger with full metadata
- Scoring factors: source type (PDF invoice > casual email), extraction clarity (explicit date > implied timeline), corroboration (multiple sources > single mention)
- Gating: Apply confidence policy (Section 6.3). High → auto-write. Gray → HITL queue. Low → candidate only.

### 7.3 Extractor Provenance

Every extraction output carries:

```json
{
  "extractor": {
    "name": "dash_commitment_extractor",
    "version": "2026-02-20",
    "model": "claude-sonnet-4-20250514",
    "prompt_sha256": "a1b2c3...",
    "schema_version": "commitment.v1"
  }
}
```

This is non-negotiable. If extraction quality degrades, we can trace exactly which model version, prompt version, and schema version produced the error. If we improve the prompt, we can replay raw artifacts through the new version and compare outputs.

### 7.4 Idempotency

Every event has an idempotency_key: `sha256(artifact_id + extractor_version + normalized_payload_hash)`. If the same artifact is processed by the same extractor version and produces the same payload, no duplicate event is written. This makes the pipeline safe to re-run.

---

## 8. Query Intelligence

### 8.1 Architecture

Single pipeline. No routing layer. No vector search tier.

```
User query (natural language)
  → Claude decomposes to structured intent
  → Postgres executes structured queries
  → Results assembled with epistemological tagging
  → Claude composes natural language response
  → Response streamed to frontend
```

### 8.2 Query Decomposition

Claude receives the user's natural language query and produces a structured query plan. **Critical guardrail:** Claude selects from an allowlist of parameterized RPCs (stored procedures). It never generates raw SQL. Parameters are validated via Zod before execution.

**RPC Allowlist:**

| RPC | Purpose |
|---|---|
| `resolve_supplier(name text)` | Fuzzy match supplier name → partner_id |
| `resolve_sku(text text)` | Fuzzy match SKU name → sku_id |
| `get_commitment_status(commitment_id uuid)` | Latest state of a specific commitment |
| `list_open_commitments(partner_id uuid, date_range tstzrange)` | All active commitments for a supplier in a time window |
| `get_reconciliation_deltas(commitment_id uuid)` | Committed vs. fulfilled comparison for a commitment |
| `get_recent_communications(relationship_id uuid, limit int)` | Latest emails/messages for a relationship |
| `get_fulfillment_state(commitment_id uuid)` | Shipment/receipt status for a commitment |
| `get_payment_obligations(date_range tstzrange)` | All invoices/payments due in a time window |
| `get_evidence_for_claim(evidence_span_ids bigint[])` | Retrieve evidence spans and linked artifacts |
| `search_evidence_text(query text, limit int)` | Full-text search across evidence spans (tsvector) |
| `search_entities_fuzzy(query text, entity_type text)` | Trigram similarity search across partners/SKUs |

**Example query plan:**

```json
{
  "intent": "status_check",
  "steps": [
    { "rpc": "resolve_sku", "args": { "text": "6oz sample bottles" } },
    { "rpc": "list_open_commitments", "args": { "partner_id": null, "date_range": "[2025-11-01,2026-02-20]" }, "depends_on": "resolve_sku" },
    { "rpc": "get_reconciliation_deltas", "args": { "commitment_id": "$commitment_id" }, "depends_on": "list_open_commitments" },
    { "rpc": "get_recent_communications", "args": { "relationship_id": "$relationship_id", "limit": 5 }, "depends_on": "list_open_commitments" },
    { "rpc": "get_evidence_for_claim", "args": { "evidence_span_ids": "$collected_spans" } }
  ],
  "response_contract": "claims_with_evidence_spans"
}
```

The decomposition is a Claude call with a system prompt that constrains output to this schema, validated via Zod before execution.

### 8.3 Response Composition

Claude receives the structured query results and composes a response that enforces the epistemological model:

System prompt constraints:
- Every claim must be tagged as FACT, INFERENCE, or UNKNOWN
- FACT claims must reference specific evidence_span_ids
- INFERENCE claims must include reasoning chain and source list
- UNKNOWN claims must state what's missing and suggest an action
- Language must reflect the tagging (definitive for facts, qualified for inferences, explicit gaps for unknowns)
- Proactive context: always attach related deadlines, payment obligations, and discrepancies

### 8.4 Example Query Flow

**User:** "Where are my 6oz sample bottles?"

**Decomposition:** Resolve "6oz sample bottles" → SKU entity → find active commitments → find fulfillment events → check reconciliation → find recent communications

**Structured results:**
- Commitment: PO #4412, Pacific Packaging, 1,200 units @ $3.50, committed ship date Jan 15
- Fulfillment: No fulfillment events found
- Reconciliation: No receipt recorded → full shortfall (1,200 units)
- Communications: Last email from Pacific Packaging was Feb 8, confirmed production complete
- Invoice: INV-PP-0223, $4,200, Net 30 from ship date

**Composed response:**
> Your 6oz sample bottles are on PO #4412 from Pacific Packaging (1,200 units @ $3.50/unit).
>
> Shipment was committed for Jan 15, but no tracking or delivery has been confirmed. Your last email from them was Feb 8 — they said production was complete but didn't mention shipping.
>
> The $4,200 invoice is outstanding. Terms are Net 30 from ship date — payment clock starts once shipping is confirmed.
>
> ⚠️ No tracking data. No communication in 12 days. No receipt recorded.
>
> [Request Update] [View PO] [View Email Thread] [Dispute Timeline]

---

## 9. Product Surfaces

### 9.1 Surface Priority (Build Order)

1. **Daily Driver** — the morning briefing
2. **Command Bar (Cmd+K)** — Ask Dash
3. **Partner Portal** — full context per supplier
4. **Payments View** — what's owed, what's due
5. **SKU View** — cross-supplier status per product
6. **Relationship Map** — question-driven network view

### 9.2 Daily Driver

Temporal attention spine: **Overdue → Today → This Week → Later**

Each item shows:
- Partner name
- Commitment summary (what, how many, when)
- Current status with epistemic tagging
- Discrepancies (if any — highlighted prominently)
- Time since last communication
- Action buttons (contextual)

**Anomaly items surface at the top regardless of temporal bucket.** A 2,500-unit shortfall is more important than a payment due next week.

Server-rendered. Refreshes via Supabase Realtime when new events land. No client-side data fetching for initial load.

### 9.3 Command Bar

Always accessible (Cmd+K on desktop, persistent search bar on mobile). Streams response via SSE as the query intelligence pipeline executes. Shows source attribution inline. Action buttons at the bottom of every response.

### 9.4 Action Layer

**This is critical. Intelligence without action is a report. Intelligence with action is an ops person.**

| Action | What It Does | Technical Implementation |
|---|---|---|
| **Request Update** | Drafts email to supplier contact referencing specific PO/commitment | Gmail API send-as-user. Pre-filled To, Subject (PO ref), Body (specific question). Matt reviews and sends. |
| **Dispute Invoice** | Drafts dispute email with evidence chain (PO, receipt, discrepancy) | Gmail API. Flags invoice in payments view as "disputed — payment held." |
| **Pay Invoice** | Executes payment via Stripe | Stripe API with idempotency key. Records transaction ID as immutable event on commitment. |
| **Confirm Receipt** | Records fulfillment event from user confirmation | Writes fulfillment_event with human source. Triggers reconciliation check. |
| **Mark as Resolved** | Closes a discrepancy or anomaly | Writes resolution event with notes. Removes from daily driver anomaly surface. |

All actions write immutable events to the ledger. Every action is auditable.

**Execution pattern (transactional outbox):** Every action that touches an external provider (Gmail, Stripe) follows this flow:
1. In a single Postgres transaction: write `action_runs` record (status: requested) + write `action_outbox` record
2. Inngest worker picks up outbox record, calls external provider with idempotency key
3. On success: update `action_runs` with provider response + provider_object_id, write `action_completed` event to ledger, mark outbox record done
4. On failure: increment attempts, retry with backoff. After max_attempts, mark dead for manual review.

This prevents dual-write corruption: if the external call fails, the outbox record remains pending and retries. If the external call succeeds but the event write fails, the idempotency key prevents double-execution on retry.

**Gmail-specific requirements:**
- Drafts are created first (user can review/edit), then sent from the draft. The draft message cannot be edited once created but can be replaced. When sent, the draft is deleted and a new message with a new ID is created. Record both draft ID and sent message ID.
- For threading: ensure subject match and include References/In-Reply-To headers per RFC 2822.
- Sent emails are ingested back as communication events (closing the loop).

**Stripe-specific requirements:**
- Always provide an idempotency key. Stripe stores the result for that key and returns the same result on retries.

---

## 10. Ingestion Sources (V1)

### 10.1 Gmail

- **Trigger:** Gmail push notifications via webhook (watch on INBOX). Watch responses include an expiration — **watch must be renewed before expiration via a scheduled Inngest job** (runs daily, renews if within 24 hours of expiry). If watch lapses, ingestion silently stops.
- **Processing:** New messages pulled via Gmail API → stored as artifacts → extraction pipeline
- **Entity resolution:** Email domain → partner matching. Sender → contact matching. Thread ID → conversation grouping.
- **Outbound capture:** Emails sent via Dash actions are sent through Gmail API (from Matt's address) and ingested back as communication events.
- **OAuth token management:** Refresh tokens stored securely (Supabase Vault or Vercel secrets). Tokens are subject to issuance limits — losing or invalidating them breaks ingestion. Monitor for token refresh failures.

### 10.2 Google Drive

- **Trigger:** Drive change notifications via webhook (or polling on schedule)
- **Processing:** New/modified files pulled via Drive API → stored as artifacts → extraction pipeline
- **Document types:** POs, invoices, contracts, terms sheets, inventory reports
- **PDF parsing:** Extract text + layout for evidence span locators (page, bbox)

### 10.3 Google Sheets

- **Trigger:** Manual import or scheduled sync
- **Processing:** Read sheet data via Sheets API → map to entities and commitments
- **Purpose:** Import Matt's existing operational tracking. Bridge from old system to Dash.

### 10.4 Slack (Post-Launch Fast-Follow)

Deferred from V1. When added:
- Opt-in per channel (not workspace-wide)
- DMs excluded by default
- Informal context tagged with lower confidence
- Same extraction pipeline, different source_system tag

---

## 11. Onboarding Flow

1. Matt connects Google Workspace (OAuth consent screen)
2. Dash pulls historical emails (last 6-12 months), Drive documents, and Sheets
3. Extraction pipeline processes everything (background, ~10 minutes for typical volume)
4. "Here's what we found" screen: auto-populated partners, contacts, SKUs, active commitments
5. Matt confirms, corrects, or removes items (each confirmation is a review_event)
6. Dash is live. Daily driver populated. Command bar active. Realtime ingestion begins.

The HITL inbox during onboarding IS the onboarding. Matt isn't "setting up the tool" — he's confirming what Dash already knows. This is the 10-minute promise.

---

## 12. Build Phases

### Phase 1 — Schema & Seed
- Implement complete Postgres schema on Supabase
- Manually seed with real data from Matt's Gmail and Drive (5-10 supplier relationships)
- Validate data model against real-world complexity
- Deliverable: populated database that can answer "where are my 6oz sample bottles" via direct SQL

### Phase 2 — Extraction Pipeline
- Build staged extraction (classify → extract → resolve → commit → score)
- Process Matt's actual emails and documents
- Calibrate confidence thresholds against real extraction quality
- Implement HITL review queue
- Deliverable: automated pipeline that populates the ledger from Gmail/Drive with auditable provenance

### Phase 3 — Query Intelligence
- Build Claude decomposition → Postgres → Claude synthesis pipeline
- Test against Matt's real questions
- Implement epistemological tagging in response schema
- Validate Fact/Inference/Unknown accuracy
- Deliverable: command bar that answers natural language questions with sourced, tagged responses

### Phase 4 — Daily Driver + Command Bar UI
- Server-rendered daily driver with temporal spine
- Reconciliation anomalies surfaced prominently
- Streamed command bar responses
- Action buttons (email drafting, payment, confirmation)
- Deliverable: the two primary surfaces Matt uses every day

### Phase 5 — Supporting Views
- Partner portal (full relationship context)
- Payments view (cash flow with invoice tracking)
- SKU view (cross-supplier product status)
- Relationship map (question-driven, not decorative)
- Deliverable: complete surface layer

### Phase 6 — Mobile
- iOS-optimized web app (not native Swift for V1)
- Daily driver and command bar as primary mobile surfaces
- Touch-friendly actions (swipe to act, tap to expand)
- Deliverable: Matt can check status and take action from his phone

---

## 13. Design Principles

1. **Calm confidence, not dashboard anxiety.** Dash tells you what matters. Everything else stays quiet.
2. **Commitments first, contacts second.** Every view resolves to: who committed, to what, by when, with what evidence.
3. **Time as the organizing spine.** Overdue → Today → This Week → Later. The most natural way to think about operations.
4. **AI-native, not AI-bolted.** The intelligence isn't a feature — it's the foundation.
5. **Trust is the product.** Fact / Inference / Unknown in every answer. Dash never bluffs.
6. **10-minute onboarding.** Connect your workspace, confirm what we found, you're live.
7. **The map answers questions.** No decorative network graphs. Every visualization surfaces risk, flow, or blocked commitments.
8. **Actions close the loop.** Intelligence without action is a report. Intelligence with action is an ops person.
9. **Complexity absorbed, not delegated.** The backend is sophisticated. The UI is simple. Matt never sees a confidence score.
10. **Amplify, don't replace.** The ops person spends time negotiating and prospecting, not reconstructing context.
