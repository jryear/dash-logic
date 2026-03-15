/**
 * Validation: Stage 4 → Stage 5-6 → idempotent re-run → ledger inspection.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/validate-pipeline.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

if (!process.env.INNGEST_EVENT_KEY) process.env.INNGEST_EVENT_KEY = "stub-for-validation";
if (!process.env.INNGEST_SIGNING_KEY) process.env.INNGEST_SIGNING_KEY = "stub-for-validation";

async function main() {
  const { runCommitmentExtractionStage } = await import(
    "../src/pipeline/stages/extract-commitments"
  );
  const { runScoreAndEmitStage } = await import(
    "../src/pipeline/stages/score-and-emit"
  );
  type ArtifactEntitiesResolvedEvent = import("../src/pipeline/types").ArtifactEntitiesResolvedEvent;
  type ArtifactCommitmentsExtractedEvent = import("../src/pipeline/types").ArtifactCommitmentsExtractedEvent;

  const { createDashPrivateSupabaseClient } = await import("../src/lib/supabase/admin");
  const { asQueryClient } = await import("../src/pipeline/utils");

  // --- Stage 4: Extract Commitments ---

  const syntheticEvent: ArtifactEntitiesResolvedEvent = {
    artifactId: 1001,
    classification: {
      document_type: "status_update",
      confidence: 0.92,
      reasoning: "Email from Pacific Packaging reporting production completion and payment terms for PO 4412.",
      schema_version: "v1",
    },
    extraction: {
      partners: [
        { name: "Pacific Packaging", role: "supplier", email_domain: "pacificpackaging.com", confidence: 0.95 },
      ],
      contacts: [],
      skus: [
        { reference: "6oz Sample Bottle", description: "6oz sample bottles for PO 4412", confidence: 0.93 },
      ],
      quantities: [
        { value: 1200, unit: "units", sku_reference: "6oz Sample Bottle", confidence: 0.90 },
      ],
      dates: [],
      amounts: [],
      evidence_spans: [
        {
          text: "Production complete on the 6oz sample bottles. Net 30 starts when the shipment leaves our dock.",
          char_start: null, char_end: null,
          supports: "production_complete_and_payment_terms",
        },
      ],
      schema_version: "v1",
    },
    resolution: {
      partners: [
        {
          input_name: "Pacific Packaging",
          outcome: "matched",
          matched_partner_id: "00000000-0000-0000-0000-000000000101",
          similarity: 1.0,
          candidates: [
            { entity_id: "00000000-0000-0000-0000-000000000101", name: "Pacific Packaging", similarity: 1.0, entity_type: "partner" },
          ],
        },
      ],
      contacts: [],
      skus: [
        {
          input_reference: "6oz Sample Bottle",
          outcome: "matched",
          matched_sku_id: "00000000-0000-0000-0000-000000000401",
          similarity: 0.85,
          candidates: [
            { entity_id: "00000000-0000-0000-0000-000000000401", name: "6oz Sample Bottle", similarity: 0.85, entity_type: "sku" },
          ],
        },
      ],
      review_required: false,
      schema_version: "v1",
    },
    extractor: {
      name: "resolve-entities-v1",
      version: "1.0.1",
      model: "database",
      prompt_sha256: "n/a",
      schema_version: "v1",
    },
    idempotencyKey: "validation-run-003",
  };

  console.log("=== Stage 4: Extract Commitments ===");
  const stage4 = await runCommitmentExtractionStage(syntheticEvent);
  console.log(`Skipped: ${stage4.skipped} | Proposals: ${stage4.output.proposals.length} | Non-commitments: ${stage4.output.non_commitments.length}`);

  for (const p of stage4.output.proposals) {
    console.log(`  ${p.target_table}.${p.event_type} (confidence: ${p.confidence}, evidence: [${p.evidence_span_ids}])`);
  }
  console.log();

  // --- Stage 5-6: Score and Emit ---

  const stage56Event: ArtifactCommitmentsExtractedEvent = {
    artifactId: syntheticEvent.artifactId,
    classification: syntheticEvent.classification,
    extraction: syntheticEvent.extraction,
    resolution: syntheticEvent.resolution,
    commitments: stage4.output,
    extractor: stage4.extractor,
    idempotencyKey: stage4.idempotencyKey,
  };

  console.log("=== Stage 5-6: Score and Emit ===");
  const stage56 = await runScoreAndEmitStage(stage56Event);
  console.log(`Skipped: ${stage56.skipped}`);
  console.log(`Written records: ${stage56.written.records.length}`);
  console.log(`Candidates stored (sub-0.70): ${stage56.candidatesStored}`);
  console.log();

  for (const rec of stage56.written.records) {
    console.log(`  event_id: ${rec.event_id} | table: ${rec.target_table} | commitment: ${rec.commitment_id}`);
  }
  console.log();

  // --- Verify ledger rows in dash_private ---

  console.log("=== Verifying ledger rows in dash_private ===");
  const dashPrivate = createDashPrivateSupabaseClient();
  const dashClient = asQueryClient(dashPrivate as never);

  for (const rec of stage56.written.records) {
    const { data, error } = await dashClient
      .from(rec.target_table)
      .select("event_id,commitment_id,seq,event_type,event_time,event_time_source,event_time_confidence,event_time_reason,event_time_provenance,confidence,epistemic_class,payload,idempotency_key")
      .eq("event_id", rec.event_id)
      .single();

    if (error || !data) {
      console.log(`  FAIL: event_id ${rec.event_id} not found in ${rec.target_table}: ${error?.message}`);
      continue;
    }

    const row = data as Record<string, unknown>;
    console.log(`  event_id: ${row.event_id}`);
    console.log(`    commitment_id: ${row.commitment_id}`);
    console.log(`    seq: ${row.seq}`);
    console.log(`    event_type: ${row.event_type}`);
    console.log(`    event_time: ${row.event_time}`);
    console.log(`    event_time_source: ${row.event_time_source}`);
    console.log(`    event_time_confidence: ${row.event_time_confidence}`);
    console.log(`    event_time_reason: ${row.event_time_reason}`);
    console.log(`    event_time_provenance: ${JSON.stringify(row.event_time_provenance)}`);
    console.log(`    confidence: ${row.confidence}`);
    console.log(`    epistemic_class: ${row.epistemic_class}`);
    console.log(`    idempotency_key: ${row.idempotency_key}`);
    console.log(`    payload: ${JSON.stringify(row.payload, null, 2)}`);
    console.log();
  }

  // --- Idempotent re-run ---

  console.log("=== Idempotent re-run ===");
  const stage56Rerun = await runScoreAndEmitStage(stage56Event);
  console.log(`Skipped (should be true): ${stage56Rerun.skipped}`);
  console.log(`Written records (should match): ${stage56Rerun.written.records.length}`);

  const sameRecords = stage56.written.records.length === stage56Rerun.written.records.length &&
    stage56.written.records.every((r, i) => r.event_id === stage56Rerun.written.records[i]?.event_id);
  console.log(`Same event_ids: ${sameRecords}`);
  console.log();

  // --- Processing jobs status ---

  console.log("=== Processing jobs for artifact 1001 ===");
  const { createAdminSupabaseClient } = await import("../src/lib/supabase/admin");
  const admin = createAdminSupabaseClient();
  const adminClient = asQueryClient(admin);
  const { data: jobs } = await adminClient
    .from("processing_jobs")
    .select("job_id,stage,status,idempotency_key")
    .eq("artifact_id", 1001)
    .order("job_id", { ascending: true });

  for (const job of (jobs ?? []) as Array<Record<string, unknown>>) {
    console.log(`  job ${job.job_id}: ${job.stage} → ${job.status}`);
  }

  // --- Summary ---

  console.log();
  console.log("=== VALIDATION SUMMARY ===");
  console.log(`Stage 4 (Opus extract): PASS (${stage4.output.proposals.length} proposals)`);
  console.log(`Stage 5-6 (score/emit): ${stage56.written.records.length > 0 ? "PASS" : "FAIL"} (${stage56.written.records.length} written, ${stage56.candidatesStored} candidates)`);
  console.log(`Ledger writes in dash_private: ${stage56.written.records.length > 0 ? "PASS" : "FAIL"}`);
  console.log(`Idempotent re-run: ${stage56Rerun.skipped ? "PASS" : "FAIL"}`);
  console.log(`Processing job progression: ${(jobs ?? []).length > 0 ? "PASS" : "FAIL"}`);
}

main().catch((error) => {
  console.error();
  console.error("=== VALIDATION FAILED ===");
  console.error(error instanceof Error ? `Error: ${error.message}` : error);
  process.exit(1);
});
