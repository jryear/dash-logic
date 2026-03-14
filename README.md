# Dash — Agent Operating Manual

> **One-line:** Dash tracks every promise anyone made Matt — orders, ship dates, deposits, invoices — with the email or PDF that proves it, and surfaces problems the morning they appear.

This file is the operational contract for all agents building Dash. The architectural specification (`ARCHITECTURE-dash.md`) is prescriptive and complete. This README tells you how to execute against it without drift.

---

## Source of Truth Hierarchy

1. `ARCHITECTURE-dash.md` — prescriptive spec. Builders implement; they do not diverge.
2. `overview-dash.md` — product context, validated user feedback, design intent.
3. This file — execution guardrails, vocabulary rules, test scenarios, risk map.

If this file contradicts the spec, the spec wins. Flag the contradiction.

---

## One-Way Doors (Never Touch Without Explicit Approval)

These four decisions shape everything downstream. They are irreversible by design:

1. **Commitment-centric model** — the atom is a commitment (promise between parties), not a transaction or contact
2. **Append-only event sourcing** — immutable events as source of truth, enforced at DB level via role privileges (SELECT + INSERT only)
3. **Fact/Inference/Unknown epistemology** — enforced at response schema level, never exposed as labels in UI
4. **Reconciliation as first-class domain concept** — committed vs. actual vs. invoiced, not just milestone tracking

---

## The Matt Language Layer

### Why This Exists

Matt is the design partner. He thinks in orders, milestones, deposits, and supplier conversations — not in commitments, event sourcing, or epistemic classes. The spec mandates that internal concepts are expressed through **behavior and language**, never through labels. This section prevents builders from accidentally leaking architecture into product surfaces, tests, or demos.

### Vocabulary Map

| Internal Term | Matt-Visible Term | UI Phrasing Pattern |
|---|---|---|
| commitment | promise / order / milestone / deposit | "PO #4412 promised 1,200 units by Jan 15." |
| commitment_event | update / change | "Jan 20: supplier moved ship date to Jan 25." |
| fulfillment_event | shipment / receipt | "No receipt recorded yet." / "Received 10,000 units." |
| reconciliation | mismatch / shortfall / overbilling alert | "Shortfall: 2,500 units." / "Invoice doesn't match receipt." |
| evidence_span | proof / source highlight | "From Feb 8 email: 'production complete'." |
| relationship | supplier record / distributor account | "Pacific Packaging — contacts, terms, open orders." |
| epistemology model | "never bluff" behavior | "Dash will say what it knows, what it's guessing, and what's missing — without labels." |
| action_outbox | (never mentioned) | Not user-facing |

The three epistemic classes are **never labeled** in UI. They are expressed purely through language patterns:

| Epistemic Behavior | UI Expression | Example |
|---|---|---|
| Grounded fact (has evidence) | Definitive language, no hedging | "Shipped Jan 15." "Invoice states $4,200." |
| Inference (derived/synthesized) | Qualified language | "Likely arriving Thursday, based on ship date and carrier average." |
| Unknown (data gap) | Explicit gap + action button | "No tracking data found." + **[Request Update]** |

### Banned Phrases in Product Surfaces

These must never appear in UI, demo scripts, test descriptions visible to users, or any Matt-facing output:

- "Commitment(s) are the atom"
- "Event sourcing" / "append-only ledger"
- "Fact / Inference / Unknown" (as labels or categories)
- Confidence percentages (e.g., "87% confident")
- "Ledger," "projection," "materialized view"
- "Epistemic," "epistemological," "epistemic class"
- "Pipeline stage," "extraction pipeline" (as user-facing concept)

### Approved Copy Patterns

Use these as templates:

- "Every promise anyone made to you — tracked, with the email that proves it."
- "We don't have tracking info yet." + **[Request Update]**
- "Invoice is outstanding. Payment clock starts when shipping is confirmed."
- "Received 10,000 of 12,500 committed units. 2,500-unit shortfall."
- "Last communication from [Partner] was 12 days ago." + **[Request Update]**
- "Based on ship date and carrier average, arrival likely Thursday."
- "No response to your follow-up from Feb 3." + **[Send Follow-Up]**

---

## Stack (Locked for V1)

| Layer | Choice | Notes |
|---|---|---|
| Database | PostgreSQL on Supabase | Single platform. Standard Postgres — portable. |
| Event Store | Append-only tables in Postgres | No Kafka, no EventStoreDB. |
| Graph Traversal | Recursive CTEs | Wide and shallow (4-5 hops max). No Neo4j. |
| Vector Search | None | Add pgvector when measured need arises. Two-way door. |
| Extraction Pipeline | Inngest + Anthropic API | Staged extraction with retries and concurrency. |
| Query Intelligence | Claude decomposition → Postgres RPCs → Claude synthesis | No raw SQL generation. Allowlisted RPCs only. |
| Frontend | Next.js 15 App Router + RSC | Server-rendered. Streamed command bar. |
| Hosting | Vercel | Transaction-mode pooler for serverless DB. |
| Background Jobs | Inngest | Extraction, reconciliation, watch renewal, outbox. |
| Storage | Supabase Storage | Content-addressable (SHA-256). Write-once. Nightly offsite backup. |
| LLM | Anthropic API direct | Sonnet for extraction. Opus for commitment extraction + answers. |
| Auth | Supabase Auth | Google OAuth for Workspace connection. |
| Payments | Stripe | Idempotency keys. Transaction IDs as immutable events. |

**Deliberately absent:** pgvector, Neo4j/AGE, Kafka/EventStoreDB, Temporal/Airflow, LangChain/LlamaIndex, Redux/Zustand, microservices.

---

## Schema Overview (14 Tables + 3 Projections)

### Core Tables

| Table | Purpose | Append-Only? |
|---|---|---|
| `artifacts` | Raw ingested documents/communications | No (standard CRUD) |
| `evidence_spans` | Specific passages supporting claims, with FTS | No |
| `partners` | Supplier/manufacturer/3PL entities | No |
| `contacts` | People at partner organizations | No |
| `skus` | Product identifiers across partners | No |
| `relationships` | Namespace connecting brand to partner | No |
| `commitment_events` | The truth core — promises and changes | **Yes** (SELECT + INSERT only) |
| `fulfillment_events` | What actually happened | **Yes** (SELECT + INSERT only) |
| `review_events` | HITL decisions on events | **Yes** (SELECT + INSERT only) |
| `communications` | Email threads linked to relationships | No |
| `processing_jobs` | Extraction pipeline tracking | No |
| `action_runs` | Action execution records | No |
| `action_outbox` | Reliable side-effect queue | No |

### Materialized Projections

| View | Purpose |
|---|---|
| `commitment_current_state` | Latest state per commitment (DISTINCT ON seq DESC) |
| `reconciliation` | Committed vs. fulfilled quantities per commitment |
| `daily_driver` | Temporal attention view with partner names, shortfalls, temporal buckets |

### DB Hardening (Non-Negotiable)

1. **Role privileges:** App role on event tables restricted to SELECT + INSERT. No UPDATE. No DELETE. Postgres role enforcement, not application logic.
2. **pg_jsonschema CHECK constraints:** Every `event_type + schema_version` on `commitment_events.payload` and `fulfillment_events.payload` must match a known JSON Schema.
3. **Private schema:** Event tables live in `dash_private` schema. Core tables (artifacts, partners, etc.) live in `public`. Materialized views and RPCs live in `public` as the safe read interface. Supabase Data API never touches `dash_private` directly.
4. **Artifact durability:** Write-once storage keys (content hash in path). No overwrite. No delete exposed to app code. Nightly offsite backup.
5. **Materialized view refresh ordering:** `daily_driver` depends on `commitment_current_state` and `reconciliation`. Refresh must always execute in this order:
   1. `REFRESH MATERIALIZED VIEW public.commitment_current_state;`
   2. `REFRESH MATERIALIZED VIEW public.reconciliation;`
   3. `REFRESH MATERIALIZED VIEW public.daily_driver;`
   Any Inngest job or application logic that refreshes views must respect this ordering. Out-of-order refresh produces stale or incorrect daily driver data.

---

## Extraction Pipeline (6 Stages)

```
Artifact Ingested
  → Stage 1: Classification (Sonnet — route by doc type)
  → Stage 2: Entity Extraction (Sonnet — identify nouns/numbers)
  → Stage 3: Entity Resolution (pg_trgm + domain matching — link to graph)
  → Stage 4: Commitment Extraction (Opus — distinguish hard/soft/conditional promises)
  → Stage 5: Conflict Resolution (most recent + highest specificity wins)
  → Stage 6: Confidence Scoring & Event Emission (apply gating policy)
```

**Confidence Gating Policy:**

| Confidence | Action |
|---|---|
| >= 0.90 (all required fields >= 0.85) | Auto-write as FACT_CANDIDATE |
| 0.70 - 0.89 | HITL queue — surface for user confirmation |
| < 0.70 | Candidate only — store but don't surface as truth |

Every extraction output carries provenance: `{name, version, model, prompt_sha256, schema_version}`.

Idempotency: `sha256(artifact_id + extractor_version + normalized_payload_hash)`. Safe to re-run.

---

## Query Intelligence (RPC Allowlist)

Claude decomposes natural language → selects from these RPCs → parameters validated via Zod → Postgres executes → Claude composes response with epistemological behavior.

**LLM never generates raw SQL.**

| RPC | Purpose |
|---|---|
| `resolve_supplier(name text)` | Fuzzy match supplier → partner_id |
| `resolve_sku(text text)` | Fuzzy match SKU → sku_id |
| `get_commitment_status(commitment_id uuid)` | Latest state of a commitment |
| `list_open_commitments(partner_id uuid, date_range tstzrange)` | Active commitments for a supplier |
| `get_reconciliation_deltas(commitment_id uuid)` | Committed vs. fulfilled comparison |
| `get_recent_communications(relationship_id uuid, limit int)` | Latest messages for a relationship |
| `get_fulfillment_state(commitment_id uuid)` | Shipment/receipt status |
| `get_payment_obligations(date_range tstzrange)` | Invoices/payments due in window |
| `get_evidence_for_claim(evidence_span_ids bigint[])` | Retrieve evidence spans + artifacts |
| `search_evidence_text(query text, limit int)` | Full-text search across evidence |
| `search_entities_fuzzy(query text, entity_type text)` | Trigram similarity search |

---

## Acceptance Test Scenarios (Product Truth Tests)

These are the minimum behavioral tests that prove the system works as Matt expects. They exercise the full stack: seed data → RPC → response contract → language behavior.

### Scenario 1: "Where are my 6oz sample bottles?"

**Seed data:**
- Partner: Pacific Packaging (supplier)
- Contact: Sarah Chen, sarah@pacificpackaging.com
- Relationship: active, terms: Net 30 from ship date
- SKU: "6oz Sample Bottle" (variants: ["6oz sample bottles", "6 oz sample"])
- Artifact: email from Sarah, Feb 8, body includes "production complete"
- Evidence spans: snippet confirming "production complete," snippet for PO terms
- commitment_events: `created` (seq 1) + `quantity_committed` 1,200 units @ $3.50 (seq 2) + `milestone_set` ship date Jan 15 (seq 3)
- No fulfillment_events

**Assertions:**
1. `resolve_sku("6oz sample bottles")` → returns the SKU
2. `list_open_commitments(partner_id, range)` → returns PO #4412
3. `get_fulfillment_state(commitment_id)` → returns empty (no fulfillment)
4. `get_reconciliation_deltas(commitment_id)` → shortfall = 1,200 (full committed qty)
5. `get_recent_communications(relationship_id, 5)` → returns Feb 8 email
6. Response contract includes: at least one UNKNOWN-class claim (no tracking), suggested action "Request Update"
7. Response language uses qualified phrasing for missing info, never states arrival as fact

### Scenario 2: "2,500 discrepancy" (PO vs receipt vs invoice)

**Seed data:**
- commitment_events: `quantity_committed` = 12,500
- fulfillment_events: `received` = 10,000
- Invoice representation: billed = 12,500 (or amount consistent with billed qty)

**Assertions:**
1. Reconciliation projection flags shortfall = 2,500
2. `daily_driver` surfaces anomaly at top (or equivalent anomaly-first ordering)
3. Action "Dispute Invoice" exists and can be queued to outbox (no external send in test)

### Scenario 3: Epistemology contract doesn't leak labels

**Seed data:**
- One FACT claim with evidence_span_ids
- One UNKNOWN claim missing required data

**Assertions:**
1. Structured response schema contains epistemic tags
2. Rendered user-visible text does **not** include literal strings "Fact", "Inference", "Unknown" (copy guardrail)

---

## 10-Minute Demo Script (Matt Language Only)

This script exercises the full spec flow using only Matt-visible language. Use for validation, investor demos, and user testing.

### 0-2 min: Onboarding (10-minute promise)

- "Connect Gmail/Drive/Sheets."
- Show "Here's what we found": suppliers, contacts, SKUs, open orders.
- Confirm/correct one item → becomes a review decision.

### 2-5 min: Canonical query ("Where are my 6oz sample bottles?")

- Type: "Where are my 6oz sample bottles?"
- Expected output (structure, not exact wording): PO link + last email + invoice terms + missing tracking/receipt + buttons.
- Click **[Request Update]** → shows prefilled draft email referencing PO and missing tracking.

### 5-7 min: The discrepancy story (the pain)

- Open an anomaly item: "Shortfall: 2,500 units" + "Invoice billed full amount."
- Show evidence: PO qty 12,500; receipt 10,000; invoice 12,500.
- Click **[Dispute Invoice]** → draft email includes evidence chain.

### 7-9 min: Daily Driver (how ops thinks)

- Show the buckets: **Overdue → Today → This Week → Later**.
- Point out: anomaly items pin to top regardless of bucket.

### 9-10 min: Partner portal (contacts + terms)

- Open supplier record: contacts (who to email), negotiated terms, evidence backing terms.

---

## Inngest Job Map

| Job | Trigger | Purpose | Spec Section |
|---|---|---|---|
| `ingest/artifact.received` | Webhook (Gmail push, Drive change) or manual upload | Store artifact, create processing_jobs for pipeline | 7.1, 10.1-10.3 |
| `extract/classify` | processing_job created (stage: classify) | Classify artifact type (PO, invoice, status_update, etc.) | 7.2 Stage 1 |
| `extract/entities` | classify completed | Extract provisional entities (partners, contacts, SKUs, amounts, dates) | 7.2 Stage 2 |
| `extract/resolve` | entities extracted | Match against existing graph via pg_trgm + domain matching | 7.2 Stage 3 |
| `extract/commitments` | entities resolved | Extract structured commitments with evidence spans (Opus) | 7.2 Stage 4 |
| `extract/score-and-emit` | commitments extracted + conflicts resolved | Confidence scoring, gating policy, event emission | 7.2 Stages 5-6 |
| `watch/gmail-renewal` | Scheduled (daily) | Renew Gmail push notification watch before expiration | 10.1 |
| `reconciliation/check` | New fulfillment_event or commitment_event written | Run committed-vs-fulfilled comparison, fire anomaly if discrepancy | 4.2 |
| `outbox/process` | action_outbox record created or retry timer | Execute external side-effects (Gmail send, Stripe payment) with idempotency | 9.4 |
| `artifacts/backup` | Scheduled (nightly) | Offsite copy of Supabase Storage objects | 5.5 |

---

## Decision Log

Decisions made during execution that aren't in the spec but are required to build. Each traces to a spec gap.

| # | Decision | Rationale | Spec Gap | Date | Status |
|---|---|---|---|---|---|
| D-001 | Invoices modeled as `commitment_events` with `event_type: 'invoice_issued'` and schema-versioned payload | Invoices are commitments — "you owe $X by date Y under terms Z." Fracturing the atom fractures reconciliation. Three-way match works because all three live on the same ledger. Two-way door disguised as a one-way door. | No explicit invoice table | 2026-03-09 | **Confirmed** |
| D-002 | One JSON Schema per `(event_type, schema_version)` tuple. V1 schemas defined below. pg_jsonschema CHECK constraints validate at write. | Strictness protects the ledger. If we add a new event type and forget its schema, the CHECK constraint rejects the write. That's the correct failure mode. | Payload shapes undefined | 2026-03-09 | **Confirmed** |
| D-003 | Daily Driver sorts by **next unresolved milestone**. Waterfall: shipment pending → ship date; shipped not received → delivery date (ship time + 7d estimate); received, invoice outstanding → payment due date; no milestones → last communication date (staleness = risk). Anomalies always pin to top. Invoice outstanding = `invoice_issued` exists with no `payment_made` for same commitment. View encodes `is_anomaly` (bool) and `sort_priority` (0=anomaly, 1=normal) as columns. Implemented via CTE-based materialized view — deviates from §6.2 simple SQL, authorized by this decision. | A commitment with multiple active milestones could land in the wrong bucket. Mitigation: active anomalies bypass bucket logic entirely. | Which date drives temporal buckets | 2026-03-09 | **Confirmed** |

| D-004 | Event tables in `dash_private` schema; core tables, materialized views, and RPCs in `public` schema | §5.5 mandates private schema for event tables; §6.1 defines columns without schema qualifier. §6.1 defines *what*, §5.5 defines *where*. Not a conflict — complementary. | §6.1 tables shown unqualified vs §5.5 private schema requirement | 2026-03-09 | **Confirmed** |

### D-002: V1 Event Payload Schemas

All schemas carry `schema_version: "v1"`. pg_jsonschema CHECK constraints validate at write.

**commitment_events:**

| event_type | Required Payload Fields |
|---|---|
| `created` | `{sku, partner_id, description}` |
| `term_set` | `{term_type, value, unit}` (e.g., Net 30, MOQ 500) |
| `quantity_committed` | `{quantity, unit, sku, unit_price, currency, due_date}` |
| `milestone_set` | `{milestone_type, date, description}` |
| `status_updated` | `{from_status, to_status, reason}` |
| `amended` | `{field, old_value, new_value, reason}` |
| `cancelled` | `{reason, cancellation_terms}` |
| `invoice_issued` | `{invoice_number, amount, currency, due_date, line_items[], terms}` |
| `payment_made` | `{amount, currency, method, reference_id}` |

**fulfillment_events:**

| event_type | Required Payload Fields |
|---|---|
| `shipped` | `{quantity, sku, tracking_number, carrier, location}` |
| `received` | `{quantity, sku, tracking_number, carrier, location}` |
| `delivered` | `{quantity, sku, tracking_number, carrier, location}` |
| `partial_received` | `{quantity, sku, tracking_number, carrier, location}` |
| `returned` | `{quantity, sku, tracking_number, carrier, location}` |

---

## Milestone Execution Plan

Milestones are ordered by dependency, not by timeline. Each is independently testable. Each test suite validates against Matt's real stories.

### Execution Sequence (Critical Path)

```
0 → 1 → 2  (data foundation — schema, seed, RPCs)
  → 3 → 4  (extraction pipeline — the intelligence engine)
    → 5     (query intelligence — "talk to your ops person")
      → 6   (UI surfaces — where Matt lives)
        → 7 (ingestion — real data flowing in)
          → 8 (actions — intelligence becomes an ops person)
```

---

### Milestone 0: Foundation Migration Pack

**What ships:** Complete SQL migration that stands up the entire Dash schema on a fresh Supabase instance — all 13 core tables, indexes, extensions, materialized views, append-only enforcement via role privileges, pg_jsonschema CHECK constraints on event payloads.

**Session context for agents:** This is the truth core. Every table's column definitions trace to ARCHITECTURE-dash.md §6.1. Event tables (`commitment_events`, `fulfillment_events`, `review_events`) live in `dash_private` schema per §5.5; core tables live in `public`; materialized views live in `public` as the safe read interface (see D-004). The migration must be idempotent (re-runnable without failure). Extensions `pg_trgm` and `pg_jsonschema` must be enabled before table creation. Role privileges (SELECT + INSERT only on event tables) are enforced here, not later. The `daily_driver` view deviates from §6.2's simple SQL to implement the D-003 waterfall via CTEs — this is authorized.

**Tests & checks:**
- Verify: INSERT into `commitment_events` succeeds with valid payload
- Verify: UPDATE on `commitment_events` fails (role privilege enforcement)
- Verify: DELETE on `commitment_events` fails
- Verify: INSERT with malformed payload rejected by pg_jsonschema CHECK
- Verify: All three materialized views (`commitment_current_state`, `reconciliation`, `daily_driver`) build without error
- Verify: Idempotency — running the migration twice produces no errors

**Traces to:** ARCHITECTURE.md §5.5, §6.1, §6.2

---

### Milestone 1: Seed with Matt's Real Data

**What ships:** A seed script that populates the schema with real-shaped data from Matt's world — 5-8 supplier relationships (Pacific Packaging, fragrance supplier, 3PL, freight partner, etc.), 10-15 commitments across those relationships, fulfillment events including the 2,500-unit bottle discrepancy story, communications, and evidence spans. This is not dummy data. It's Matt's operational reality encoded as events.

**Session context for agents:** The seed must exercise every event_type defined in D-002. It must create at least one instance of each epistemic class (FACT, FACT_CANDIDATE, INFERENCE). It must produce a reconciliation discrepancy that the materialized view surfaces. The 6oz sample bottles story from §8.4 must be answerable from this seed via direct SQL.

**Tests & checks:**
- Verify: `SELECT * FROM daily_driver` returns items in all four temporal buckets
- Verify: `SELECT * FROM reconciliation WHERE shortfall > 0` returns the bottle discrepancy
- Verify: The query "where are my 6oz sample bottles" can be answered by joining skus → commitment_events → fulfillment_events → communications → evidence_spans
- Verify: Every commitment has at least one evidence_span_id linking to an artifact
- Verify: Materialized views refresh cleanly after seed

**Traces to:** ARCHITECTURE.md §8.4, §12 Phase 1

---

### Milestone 2: RPC Allowlist (Query Interface)

**What ships:** All 11 Postgres stored procedures from §8.2 — `resolve_supplier`, `resolve_sku`, `get_commitment_status`, `list_open_commitments`, `get_reconciliation_deltas`, `get_recent_communications`, `get_fulfillment_state`, `get_payment_obligations`, `get_evidence_for_claim`, `search_evidence_text`, `search_entities_fuzzy`. These are the only interface between Claude and the database. No raw SQL ever.

**Session context for agents:** These RPCs are the security boundary. Claude's query decomposition selects from this allowlist with validated parameters. Each RPC must return structured JSON. Fuzzy matching RPCs use `pg_trgm` similarity with configurable threshold. All RPCs are tested against the Milestone 1 seed data.

**Tests & checks:**
- Verify: `resolve_sku('6oz sample bottles')` returns the correct sku_id
- Verify: `resolve_supplier('pacific pack')` fuzzy-matches to Pacific Packaging
- Verify: `list_open_commitments(partner_id, date_range)` returns only active commitments in window
- Verify: `get_reconciliation_deltas(commitment_id)` returns the 2,500-unit shortfall
- Verify: `get_recent_communications(relationship_id, 5)` returns last 5 communications ordered by date
- Verify: `search_evidence_text('shipped January', 10)` returns matching evidence spans via tsvector
- Verify: Every RPC handles NULL/empty inputs gracefully (no exceptions, empty result sets)

**Traces to:** ARCHITECTURE.md §8.2

---

### Milestone 3: Extraction Pipeline — Stages 1-3

**What ships:** The first half of the extraction pipeline — Classification, Entity Extraction, Entity Resolution. Inngest functions that take a raw artifact, classify its document type, extract provisional entities, and resolve them against existing partners/contacts/SKUs in the database. Processing jobs tracked in `processing_jobs` table.

**Session context for agents:** Stage 1 uses Sonnet for classification (cheap, fast). Stage 2 uses Sonnet with structured output for entity extraction. Stage 3 is mostly database-driven (pg_trgm fuzzy matching, email domain matching) with Sonnet only for ambiguous cases. Every extraction carries the extractor provenance object from §7.3. Idempotency keys prevent duplicate processing.

**Tests & checks:**
- Verify: A PO email classifies as `purchase_order`, a casual check-in as `check_in`
- Verify: Entity extraction from a PO email produces partner name, contact email, SKU, quantity, date
- Verify: Entity resolution matches "Pacific Pack" to existing "Pacific Packaging" partner
- Verify: Entity resolution flags a genuinely new supplier for creation (not false-merged)
- Verify: Processing jobs table shows correct stage progression (pending → processing → completed)
- Verify: Re-processing the same artifact produces no duplicate entities (idempotency)

**Traces to:** ARCHITECTURE.md §7.1, §7.2 (Stages 1-3), §7.3, §7.4

---

### Milestone 4: Extraction Pipeline — Stages 4-6

**What ships:** The second half — Commitment Extraction, Conflict Resolution, Confidence Scoring & Event Emission. This is the highest-stakes extraction. Opus distinguishes hard commitments from soft commitments from non-commitments. New events are checked against existing ledger for conflicts. Confidence gating policy (§6.3) determines auto-write vs. HITL queue vs. candidate-only.

**Session context for agents:** Stage 4 is where trust engineering lives at the data layer. The extraction must correctly distinguish "ships Jan 15" (hard commitment) from "should be there by Friday" (soft) from "we're working on it" (non-commitment). Stage 5 applies most-recent-signal-wins for current state but preserves full history. Stage 6 applies the confidence gating table. Events that pass auto-write threshold land as FACT_CANDIDATE. Below threshold → HITL queue.

**Tests & checks:**
- Verify: "Ships January 15" extracts as hard commitment with high confidence
- Verify: "Should arrive by Friday" extracts as soft commitment with qualified confidence
- Verify: "We're working on it" does NOT produce a commitment event
- Verify: A new ship date email supersedes an older PO ship date in current state projection, but both events exist on the ledger
- Verify: High-confidence extraction (≥0.90) auto-writes as FACT_CANDIDATE
- Verify: Gray-zone extraction (0.70-0.89) lands in HITL queue, not on active ledger
- Verify: Low-confidence extraction (<0.70) stored as candidate only
- Verify: Full extractor provenance recorded on every emitted event

**Traces to:** ARCHITECTURE.md §7.2 (Stages 4-6), §6.3, §3.1

---

### Milestone 5: Query Intelligence Pipeline

**What ships:** The full ask-Dash loop. Claude decomposes a natural language query into a structured query plan (selecting from RPC allowlist), Postgres executes, Claude composes the response with epistemological tagging. Zod validation on both the query plan and the response schema.

**Session context for agents:** This is the "talk to your ops person" moment. The system prompt constrains Claude to the RPC allowlist — it never generates SQL. The response composition enforces §3.1: every claim tagged FACT/INFERENCE/UNKNOWN, facts carry evidence_span_ids, inferences carry reasoning chains, unknowns state what's missing + suggest actions. The response uses natural language (not labels) per §3.3.

**Tests & checks:**
- Verify: "Where are my 6oz sample bottles?" produces the full answer from §8.4
- Verify: Facts in the response reference specific evidence spans
- Verify: Inferences use qualified language ("likely," "estimated," "based on")
- Verify: Missing data surfaces explicitly ("No tracking data found") with action suggestion
- Verify: Query plan validates against Zod schema before execution
- Verify: Response schema validates against Zod schema before streaming to frontend
- Verify: A nonsensical query ("how's the weather") gets a graceful "I can help with supplier and operations questions" response, not an error

**Traces to:** ARCHITECTURE.md §8.1-§8.4, §3.1-§3.3

---

### Milestone 6: Daily Driver + Command Bar UI

**What ships:** The two primary surfaces Matt uses every day. Server-rendered daily driver with temporal attention spine (Overdue → Today → This Week → Later), anomalies pinned to top, reconciliation discrepancies highlighted. Command bar (Cmd+K) with streamed responses from the query intelligence pipeline. Action buttons on every item and response.

**Session context for agents:** The daily driver is a materialized view rendered server-side. Supabase Realtime pushes UI refresh when new events land, but the frontend always queries the ledger for truth (§5.5). The command bar streams via SSE. Action buttons are contextual — "Request Update" when communication is stale, "Confirm Receipt" when shipment is in-transit, "Dispute Invoice" when discrepancy exists. Per §3.3: Matt never sees "Fact," "Inference," or confidence percentages.

**Tests & checks:**
- Verify: Daily driver renders all four temporal buckets with correct sorting per D-003
- Verify: The bottle discrepancy appears at the top as an anomaly, regardless of its temporal bucket
- Verify: Command bar query "where are my 6oz sample bottles" streams a sourced response
- Verify: "Request Update" action opens a pre-drafted Gmail compose (not sent automatically)
- Verify: Epistemological tagging is invisible — expressed only through language, never labels
- Verify: Page loads server-rendered (no client-side data fetch for initial state)
- Verify: Realtime subscription refreshes the view when a new commitment event is inserted

**Traces to:** ARCHITECTURE.md §9.1-§9.4, §3.3, §13

---

### Milestone 7: Ingestion + Onboarding Loop

**What ships:** Gmail webhook integration (push notifications), Drive change notifications, Google Sheets import. The onboarding flow: OAuth connect → historical pull (6-12 months) → extraction pipeline processes everything → "Here's what we found" confirmation screen → live. Gmail watch renewal via scheduled Inngest job.

**Session context for agents:** This closes the loop from raw data to live system. The onboarding confirmation screen IS the HITL inbox — Matt isn't "setting up the tool," he's confirming what Dash already knows (§11). Gmail watch expiration is a silent failure mode that must be prevented via daily renewal job. OAuth refresh token management is critical — losing the token breaks all ingestion.

**Tests & checks:**
- Verify: OAuth flow completes and refresh token is stored securely
- Verify: Historical Gmail pull retrieves messages from last 6 months
- Verify: New incoming email triggers webhook → artifact creation → pipeline execution
- Verify: Gmail watch is renewed before expiration (test the scheduled job)
- Verify: Onboarding "Here's what we found" screen shows auto-detected partners, SKUs, commitments
- Verify: User confirmation writes review_events (approved/rejected/amended)
- Verify: Drive file upload triggers artifact creation and processing
- Verify: Duplicate artifact ingestion is blocked by content_sha256 uniqueness

**Traces to:** ARCHITECTURE.md §10.1-§10.3, §11

---

### Milestone 8: Action Layer + Outbox

**What ships:** The transactional outbox pattern for all external side-effects. Gmail draft creation and sending (from Matt's address), Stripe payment execution, fulfillment confirmation. Every action writes an immutable event to the ledger. Sent emails ingested back as communication events.

**Session context for agents:** This is what separates Dash from a report. The outbox pattern (§9.4) ensures atomic consistency: ledger event + outbox record in one Postgres transaction, then the Inngest worker executes against the external provider with idempotency keys. Gmail drafts are created first (user reviews), then sent. Stripe always gets an idempotency key. Sent emails close the loop by re-entering the ingestion pipeline.

**Tests & checks:**
- Verify: "Request Update" creates a Gmail draft with correct To, Subject (PO reference), and body
- Verify: Draft send creates a new message ID (Gmail deletes draft on send) and both IDs are recorded
- Verify: Sent email is re-ingested as a communication event on the relationship
- Verify: Stripe payment records transaction ID as immutable event
- Verify: Outbox retry works — simulated provider failure retries with backoff
- Verify: Idempotency — duplicate outbox processing doesn't create duplicate external actions
- Verify: Dead letter — after max_attempts, outbox record marked dead for manual review

**Traces to:** ARCHITECTURE.md §9.4, §5.1 (Action Outbox)

---

## Implementation Risks + Mitigations

### Risk 1: Translation Drift
Builders may ship UI copy with internal architecture terms.
**Mitigation:** Keep "Banned phrases" list as a required PR checklist + Scenario 3 as automated gate.

### Risk 2: pg_jsonschema Availability on Supabase
Extension may not be available or may require manual enablement.
**Mitigation:** Verify availability before Milestone 0. If unavailable, validate at application layer and flag as tech debt.

### Risk 3: Gmail Push Notification Reliability
Watch expiration is a silent killer — ingestion stops with no error.
**Mitigation:** Daily renewal job (Milestone 7) is non-negotiable. Monitor for watch renewal failures.

### Risk 4: Opus Extraction Quality on Real Messy Emails
Real supplier emails are noisy, ambiguous, and context-dependent.
**Mitigation:** Calibrate confidence thresholds in Milestone 4 against real data, not before. Start strict and loosen.

### Risk 5: Reconciliation Scope Creep
Three-way matching can balloon if we try to fully solve pricing/partial shipments/credits in V1.
**Mitigation:** Constrain V1 mismatch types to spec list and prove the 2,500 case end-to-end first.

### Risk 6: Onboarding Promise Fragility
"~10 minutes" breaks if HITL becomes mandatory for most extracted items.
**Mitigation:** Stage confidence gating so onboarding can be "confirm what we found" with a small queue, not "data entry."

---

## Agent Instructions

1. **Read the spec first.** `ARCHITECTURE-dash.md` is prescriptive. Don't invent architecture.
2. **Use Matt language in all user-facing output.** Check the vocabulary map above. If you're about to write "commitment," ask yourself if Matt would say "order" or "promise" instead.
3. **Never leak internal terms.** No "event sourcing," "ledger," "projection," "epistemic class" in UI, test descriptions, or demos.
4. **Trace every artifact to a spec section.** If you can't point to the spec section that mandates what you're building, stop and ask.
5. **Flag ADR candidates.** If you need to make a decision the spec doesn't cover, log it in the Decision Log above and flag it for review. Don't silently diverge.
6. **Protect one-way doors.** Never modify the commitment-centric model, append-only enforcement, epistemology contract, or reconciliation model without explicit approval.
7. **Test with Matt's stories.** The acceptance scenarios above are the product truth tests. If the system can answer "where are my 6oz sample bottles" and catch the 2,500-unit discrepancy, it works.
8. **Prefer simplicity.** No over-engineering. No features beyond what the spec mandates. No abstractions for hypothetical future requirements.
9. **Milestones are the unit of work.** Each milestone has a "What ships," "Session context," "Tests & checks," and "Traces to." Build to those specs. Don't blend milestones.
