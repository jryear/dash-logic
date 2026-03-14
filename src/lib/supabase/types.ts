// Traces to: ARCHITECTURE-dash.md §6.1

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      artifacts: {
        Row: {
          artifact_id: number;
          source_system: string;
          source_locator: string;
          source_revision: string | null;
          content_sha256: string;
          mime_type: string;
          storage_uri: string;
          captured_at: string;
          metadata: Json;
        };
      };
      evidence_spans: {
        Row: {
          evidence_span_id: number;
          artifact_id: number;
          locator: Json;
          extracted_text: string;
          snippet_sha256: string;
          created_at: string;
        };
        Insert: {
          artifact_id: number;
          locator: Json;
          extracted_text: string;
          snippet_sha256: string;
          created_at?: string;
        };
      };
      contacts: {
        Row: {
          contact_id: string;
          partner_id: string;
          name: string;
          email: string | null;
          role: string | null;
          metadata: Json;
        };
      };
      processing_jobs: {
        Row: {
          job_id: number;
          artifact_id: number;
          stage: string;
          idempotency_key?: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "skipped";
          started_at: string | null;
          completed_at: string | null;
          result: Json | null;
          error: string | null;
          retry_count: number;
          created_at: string;
        };
        Insert: {
          artifact_id: number;
          stage: string;
          idempotency_key?: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "skipped";
          started_at?: string | null;
          completed_at?: string | null;
          result?: Json | null;
          error?: string | null;
          retry_count?: number;
        };
        Update: Partial<{
          status: "pending" | "processing" | "completed" | "failed" | "skipped";
          idempotency_key: string | null;
          started_at: string | null;
          completed_at: string | null;
          result: Json | null;
          error: string | null;
          retry_count: number;
        }>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      resolve_supplier: {
        Args: { p_name: string | null };
        Returns: Json;
      };
      resolve_sku: {
        Args: { p_text: string | null };
        Returns: Json;
      };
      search_entities_fuzzy: {
        Args: { p_query: string | null; p_entity_type: string | null };
        Returns: Json;
      };
    };
  };
}
