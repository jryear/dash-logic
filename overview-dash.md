# Dash — Project Overview

## What This Is

An operational intelligence layer for scaling product brands. Dash replaces the ops person who quit — it ingests every communication, document, and transaction across a brand's supplier network and becomes the single source of truth that both answers questions and anticipates problems.

Built for and with Matt (Mozi Wash) as design partner. Not a prototype. A serious V1.

---

## The Pain

- Ops person leaves → institutional knowledge vanishes overnight
- 10-50+ supplier relationships, each with unique terms, contacts, milestones, and communication history
- No single view of "what do I owe, what's coming, where's everything"
- Living across Gmail, Slack, Sheets, POs, invoices — drowning in fragmented context
- The founder becomes the ops person by default, and they shouldn't be

## The Insight

Matt doesn't want a dashboard. He wants to talk to his ops person who quit.

"Where are my 6oz sample bottles?" → Dash traces across the relationship graph, finds the PO tied to the supplier, the last email about shipment status, the invoice terms, the fulfillment timeline, and assembles a contextual answer: "Based on your PO with [Supplier], they shipped Jan 15. Tracking shows arrival Thursday. You have 12 days until the $4,200 invoice is due."

That's the product.

---

## Core Architectural Bet

**Commitments are the atom.** A relationship is the namespace — the container that gives context. But what we're actually tracking is the irreducible unit of operational truth: who committed, to what (qty/spec), by when (milestone/date), under what gate (deposit/acceptance terms), with what evidence (email/PDF), and what changed since (event log).

Every order, payment, shipment, and communication resolves to one or more commitments between parties. The relationship graph provides the context. The commitment ledger provides the truth.

This is why event-sourcing and provenance aren't optional — they're the moat. Every commitment carries its full evidence chain. Every change is an immutable event. You can always answer "who said what, when, and has anything changed since?"

---

## Trust Engineering

This is where products like Dash live or die. One confident wrong answer — "arrives Thursday" when it actually shipped late — and the founder never trusts it again. Trust is not UX polish. Trust is the product.

### The Epistemological Model

Every data point Dash surfaces falls into exactly one of three categories:

- **Fact**: Explicit, sourced, grounded in artifact. Carrier tracking says in-transit. Invoice PDF states Net 30. Supplier email says "shipped Jan 15." These carry source attribution and timestamp.
- **Inference**: Derived, probabilistic, synthesized across sources. "Based on ship date and carrier average, arrival likely Thursday." These carry confidence level, reasoning chain, and source list.
- **Unknown**: Missing data that Dash knows it doesn't have. No tracking number found. No response to last follow-up. Payment terms not yet extracted. These surface as explicit gaps, not silence.

### The Rule

Dash refuses to speak in finals unless the underlying data is a grounded Fact. When it infers, it says so: "Most likely X, because Y sources — confirm by clicking 'Request update'." When it doesn't know, it says that too: "No tracking data found for this PO. Last supplier communication was 8 days ago."

This three-tier epistemology is not a feature. It's the core contract between Dash and the user.

---

### Two Interaction Modes

**Mode 1 — Ask Dash (Conversational Intelligence)**
Natural language query interface. The user asks a question in plain language. Dash synthesizes across all ingested sources — emails, Slack, POs, invoices, documents — and returns a contextual answer with source attribution and proactive follow-up context.

This is the interface Matt is imagining. It's what makes him feel like his ops person is back.

**Mode 2 — Dash Tells You (Proactive Daily Driver)**
Temporal attention spine: Past (overdue) → Today (due) → This Week (upcoming) → Later (horizon). Surfaces what needs attention before the founder knows to ask. The ops person didn't just answer questions — they flagged problems before anyone else saw them.

Together: **an operational intelligence that both answers and anticipates.**

### Core Surfaces

- **Daily Driver**: What needs attention today — overdue items, at-risk milestones, upcoming deadlines, anomalies. Organized temporally, not categorically. Validated by Matt as "a good daily dashboard."
- **Relationship Map**: Not a global network graph for its own sake — the map answers operational questions. "Where is the bottleneck for SKU X?" "Which supplier causes the most slips vs terms?" "What commitments are blocked by unpaid deposits?" It surfaces risk and flow across the supplier network. If it doesn't answer a question, it doesn't render. Matt requested this: "I think a map would also be cool." We make it useful, not decorative.
- **Partner Portal**: Click into any relationship. See contacts, negotiated terms, active orders, communication history, payment status. Full context for any supplier in one place.
- **SKU View**: Where is everything for this product across all parties? Cross-references POs, shipment status, inventory, and supplier timelines per SKU.
- **Payments View**: What do I owe, what am I owed, when is it due. Cash flow forecast grounded in real invoice data and payment terms.
- **Actions**: One-click follow-ups, milestone confirmations, payment triggers (Stripe integration).

### Primary Interaction Pattern

**Command bar (Cmd+K / search bar)** — the Ask Dash interface. This is where "where are my 6oz sample bottles" lives. Always accessible, always the fastest path to an answer.

---

## Onboarding

Connect Google Workspace → AI extraction pipeline reads emails, documents, and attachments → automatically identifies partners, contacts, terms, POs, invoices → "Here's what we found" → user confirms/refines → live in 10 minutes.

No manual data entry. The system reads what already exists and builds the map automatically.

---

## Ingestion Architecture

### V1 Sources (Priority Order)

1. **Gmail** — primary communication channel with suppliers. Richest source of relationship context, terms negotiation, status updates, and informal commitments.
2. **Google Drive** — POs, invoices, contracts, terms sheets. Structured documents that anchor the relationship data.
3. **Google Sheets** — existing operational tracking. Import existing mental models.
4. **Slack** (post-launch fast-follow) — Real-time communication layer with critical informal context. Deferred from V1 for three reasons: permission-heavy OAuth is politically sensitive, DMs are often off-limits, and informal snippets explode ingestion ambiguity with half-context and ungrounded commitments. Ships as opt-in per-channel capture, not entire workspace access.

### Extraction Pipeline

Claude-powered extraction that processes unstructured communications into structured relationship data:

- **Entity Resolution**: Identify partners, contacts, SKUs, and link them across sources
- **Terms Extraction**: Payment terms, lead times, MOQs, pricing from contracts and email negotiations
- **Status Inference**: Cross-source synthesis to determine current state (PO says shipped, email says delayed — which wins? Most recent signal with highest specificity)
- **Milestone Detection**: Key dates, deadlines, and commitments extracted and tracked
- **Confidence Scoring**: Every extracted data point carries a confidence level and source attribution

---

## Technical Architecture

- **Event-Sourced Commitment Ledger**: Every commitment and every change to a commitment is an immutable event. Full provenance chain. Append-only enforced at DB level (SELECT + INSERT only). Temporal queries native.
- **Reconciliation Engine**: Three-way matching — commitment vs. fulfillment vs. invoice. Discrepancies detected automatically when events land. Shortfalls, overbilling, timeline slips surfaced in the daily driver immediately.
- **Relationship Graph**: Partners, contacts, SKUs, commitments, payments, communications — all nodes in a connected graph. Traversal via recursive CTEs on adjacency tables.
- **Claude Extraction Pipeline**: Processes raw inputs (email, docs) into structured commitment events on the ledger. Every extraction carries confidence scoring and source attribution. Staged: classify → extract → resolve → commit → score.
- **Query Intelligence Layer**: Claude decomposes natural language → selects from allowlisted Postgres RPCs → assembles evidence → Claude composes response with Fact/Inference/Unknown tagging. LLM never generates raw SQL.
- **V1 Retrieval**: Entity resolution (canonical IDs) + full-text search (tsvector) + fuzzy matching (pg_trgm). No embeddings until measured need.
- **Google Workspace Integration**: OAuth, Gmail API, Drive API, Sheets API. Gmail push notifications with scheduled watch renewal. The "truth core."
- **Action Outbox**: All external side-effects (Gmail sends, Stripe payments) use transactional outbox pattern — ledger event + outbox record in one transaction, worker executes with provider idempotency keys.
- **Next.js Frontend**: App Router, server components, streamed command bar responses, Supabase Realtime for UI refresh (not truth).
- **Stripe Integration**: Payment processing with idempotency keys. Transaction IDs recorded as immutable events.

---

---

## Design Principles

1. **Calm confidence, not dashboard anxiety.** Dash tells you what matters. Everything else stays quiet.
2. **Commitments first, contacts second.** Every view resolves to: who committed, to what, by when, with what evidence.
3. **Time as the organizing spine.** Past → Today → This Week → Later. The most natural way to think about operations.
4. **AI-native, not AI-bolted.** The intelligence isn't a feature — it's the foundation. The extraction pipeline, the query layer, the proactive surfacing — all Claude-powered from day one.
5. **Trust is the product.** Fact / Inference / Unknown in every answer. Dash never bluffs. One confident wrong answer kills adoption permanently.
6. **10-minute onboarding.** Connect your workspace, confirm what we found, you're live. Zero manual data entry.
7. **The map answers questions.** No decorative network graphs. Every visualization surfaces risk, flow, or blocked commitments.

---

## Validated So Far

- ✅ Daily dashboard / temporal attention spine (Matt: "Its a good daily dashboard")
- ✅ Overall direction and feel (Matt: "Its pretty sick actually")
- ✅ Relationship map concept (Matt: "I think a map would also be cool")
- ✅ Auto-ingestion thesis (Matt: "read all emails/slack... upload it auto and build the map automatically")
- ✅ Conversational query interface (Matt: "users can just search... 'where are my 6oz sample bottles'")
- ✅ Document parsing (Matt: "reads our POs and invoices, emails and whatever and puts everything in automatically")
- ✅ Name: Dash (Matt's choice)

---

## Open Questions for V1

1. **Query intelligence bar**: What quality of answer is "good enough" for launch? How do we handle low-confidence extractions gracefully without undermining trust?
2. **Relationship map visualization**: What's the right rendering? Must be question-driven (bottlenecks, slips, blocked commitments) — not a generic network graph.
3. **Commitment extraction accuracy**: What's the minimum viable extraction confidence for auto-populating the ledger vs. requiring user confirmation?
4. **Trademark**: "Dash" namespace — DoorDash, Plotly Dash. Need to verify availability.

## Resolved Decisions

- ✅ **Ingestion scope**: Gmail + Drive + Sheets as V1 "truth core." Slack is post-launch fast-follow, opt-in per channel.
- ✅ **Trust model**: Fact / Inference / Unknown epistemology is first-class, not UX polish.
- ✅ **Core atom**: Commitments, not relationships. Relationships are the namespace; commitments are what we track.
- ✅ **Reconciliation**: Three-way matching (commitment vs. fulfillment vs. invoice) as first-class domain concept.
- ✅ **Append-only enforcement**: DB-level role privileges (SELECT + INSERT only on event tables), not convention.
- ✅ **Action safety**: Transactional outbox pattern for all external side-effects (Gmail, Stripe).
- ✅ **Query guardrails**: LLM selects from allowlisted RPCs with validated parameters. Never generates raw SQL.
- ✅ **V1 retrieval**: Entity resolution + full-text search + trigram matching. No embeddings until measured need.
- ✅ **Name**: Dash (Matt's choice).
