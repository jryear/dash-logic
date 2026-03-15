// Traces to: ARCHITECTURE-dash.md §8.2; README.md Query Intelligence

import type { AllowedRpc } from "@/lib/query/types";

export type RpcArgSpec = {
  type: "text" | "uuid" | "tstzrange" | "int" | "bigint_array";
  nullable: boolean;
  allowed_values?: string[];
};

export type RpcManifestEntry = {
  args: Record<string, RpcArgSpec>;
  returns: string[];
  returns_collection: boolean;
};

export const RPC_MANIFEST: Record<AllowedRpc, RpcManifestEntry> = {
  resolve_supplier: {
    args: { p_name: { type: "text", nullable: true } },
    returns: ["partner_id", "name", "normalized_name", "domain", "partner_type", "similarity"],
    returns_collection: false,
  },
  resolve_sku: {
    args: { p_text: { type: "text", nullable: true } },
    returns: ["sku_id", "name", "normalized_name", "variants", "similarity"],
    returns_collection: false,
  },
  get_commitment_status: {
    args: { p_commitment_id: { type: "uuid", nullable: false } },
    returns: [
      "commitment_id",
      "seq",
      "current_status",
      "event_time",
      "event_time_source",
      "event_time_confidence",
      "event_time_reason",
      "event_time_provenance",
      "is_time_uncertain",
      "recorded_at",
      "relationship_id",
      "partner_id",
      "partner_name",
      "payload",
      "evidence_span_ids",
      "extractor",
      "confidence",
      "epistemic_class",
    ],
    returns_collection: false,
  },
  list_open_commitments: {
    args: {
      p_partner_id: { type: "uuid", nullable: true },
      p_date_range: { type: "tstzrange", nullable: true },
    },
    returns: [
      "commitment_id",
      "seq",
      "current_status",
      "event_time",
      "event_time_source",
      "event_time_confidence",
      "event_time_reason",
      "event_time_provenance",
      "is_time_uncertain",
      "relationship_id",
      "partner_id",
      "partner_name",
      "payload",
      "confidence",
      "epistemic_class",
    ],
    returns_collection: true,
  },
  get_reconciliation_deltas: {
    args: { p_commitment_id: { type: "uuid", nullable: false } },
    returns: [
      "commitment_id",
      "relationship_id",
      "committed_quantity",
      "fulfilled_quantity",
      "shortfall",
      "committed_amount",
      "sku",
    ],
    returns_collection: false,
  },
  get_recent_communications: {
    args: {
      p_relationship_id: { type: "uuid", nullable: false },
      p_limit: { type: "int", nullable: true },
    },
    returns: [
      "communication_id",
      "artifact_id",
      "relationship_id",
      "contact_id",
      "contact_name",
      "direction",
      "subject",
      "summary",
      "communication_date",
      "thread_id",
    ],
    returns_collection: true,
  },
  get_fulfillment_state: {
    args: { p_commitment_id: { type: "uuid", nullable: false } },
    returns: [
      "event_id",
      "seq",
      "event_type",
      "event_time",
      "event_time_source",
      "event_time_confidence",
      "event_time_reason",
      "event_time_provenance",
      "is_time_uncertain",
      "quantity",
      "sku",
      "tracking_number",
      "carrier",
      "location",
      "evidence_span_ids",
      "confidence",
    ],
    returns_collection: true,
  },
  get_payment_obligations: {
    args: { p_date_range: { type: "tstzrange", nullable: true } },
    returns: [
      "commitment_id",
      "partner_name",
      "invoice_number",
      "amount",
      "due_date",
      "paid",
      "payment_reference",
    ],
    returns_collection: true,
  },
  get_evidence_for_claim: {
    args: { p_evidence_span_ids: { type: "bigint_array", nullable: false } },
    returns: [
      "evidence_span_id",
      "artifact_id",
      "locator",
      "extracted_text",
      "source_system",
      "source_locator",
      "source_revision",
      "mime_type",
      "storage_uri",
      "captured_at",
      "artifact_metadata",
    ],
    returns_collection: true,
  },
  search_evidence_text: {
    args: {
      p_query: { type: "text", nullable: false },
      p_limit: { type: "int", nullable: true },
    },
    returns: [
      "evidence_span_id",
      "artifact_id",
      "extracted_text",
      "source_system",
      "source_locator",
      "locator",
      "rank",
    ],
    returns_collection: true,
  },
  search_entities_fuzzy: {
    args: {
      p_query: { type: "text", nullable: false },
      p_entity_type: { type: "text", nullable: false, allowed_values: ["partner", "sku", "contact"] },
    },
    returns: ["entity_id", "name", "similarity", "entity_type"],
    returns_collection: true,
  },
  resolve_po_number: {
    args: {
      p_po_text: { type: "text", nullable: false },
    },
    returns: [
      "commitment_id",
      "relationship_id",
      "partner_id",
      "partner_name",
      "matched_evidence_span_ids",
      "match_score",
    ],
    returns_collection: false,
  },
};

export function renderRpcManifestForPrompt() {
  return Object.entries(RPC_MANIFEST)
    .map(([rpc, manifest]) => {
      const args = Object.entries(manifest.args)
        .map(([name, spec]) => {
          const allowedValues = spec.allowed_values ? ` allowed=${spec.allowed_values.join("|")}` : "";
          return `${name}: ${spec.type}${spec.nullable ? " | null" : ""}${allowedValues}`;
        })
        .join(", ");
      const returns = manifest.returns.join(", ");
      return `- ${rpc}(${args}) -> ${manifest.returns_collection ? "array" : "object"} fields: ${returns}. DO NOT ASSUME OTHER FIELDS.`;
    })
    .join("\n");
}
