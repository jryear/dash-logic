// Traces to: ARCHITECTURE-dash.md §7.2 Stage 3, README.md Milestone 3

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  EntityResolutionResultSchema,
  type ClassificationResult,
  type EntityExtractionResult,
  type EntityResolutionResult,
} from "@/pipeline/types";
import {
  asQueryClient,
  buildIdempotencyKey,
  buildProvenance,
  completeProcessingJob,
  failProcessingJob,
  findExistingCompletedJob,
  stableStringify,
  startProcessingJob,
} from "@/pipeline/utils";

const RESOLUTION_VERSION = "1.0.1";
const AUTO_MATCH_THRESHOLD = 0.75;
const AMBIGUOUS_THRESHOLD = 0.45;
const AMBIGUOUS_MARGIN = 0.08;
const DOMAIN_MATCH_SIMILARITY = 0.95;

type SearchEntityMatch = {
  entity_id: string;
  name: string;
  similarity: number;
  entity_type: "partner" | "sku" | "contact";
};

type ExactContactMatch = {
  contact_id: string;
  name: string;
  email: string | null;
};

type PartnerDomainMatch = {
  partner_id: string;
  name: string;
  domain: string;
};

function extractEmailDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase().trim();
  return domain || null;
}

function collectDomainsForPartner(
  partnerName: string,
  contacts: EntityExtractionResult["contacts"],
): string[] {
  const domains: string[] = [];
  for (const contact of contacts) {
    if (!contact.email) continue;
    const refsThisPartner =
      contact.partner_reference &&
      contact.partner_reference.toLowerCase().includes(partnerName.toLowerCase());
    if (refsThisPartner || contacts.length === 1) {
      const domain = extractEmailDomain(contact.email);
      if (domain) domains.push(domain);
    }
  }
  return [...new Set(domains)];
}

async function callRpcJson(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  fn: string,
  args: Record<string, unknown>,
) {
  const rpcClient = supabase as unknown as {
    rpc: (
      name: string,
      params?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  return rpcClient.rpc(fn, args);
}

function normalizeResolvedEntity(
  input: unknown,
  entityType: SearchEntityMatch["entity_type"],
): SearchEntityMatch[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  const record = input as Record<string, unknown>;

  if (typeof record.entity_id === "string" && typeof record.name === "string") {
    return [
      {
        entity_id: record.entity_id,
        name: record.name,
        similarity: Number(record.similarity ?? 0),
        entity_type: entityType,
      },
    ];
  }

  if (entityType === "partner" && typeof record.partner_id === "string" && typeof record.name === "string") {
    return [
      {
        entity_id: record.partner_id,
        name: record.name,
        similarity: Number(record.similarity ?? 0),
        entity_type: entityType,
      },
    ];
  }

  if (entityType === "sku" && typeof record.sku_id === "string" && typeof record.name === "string") {
    return [
      {
        entity_id: record.sku_id,
        name: record.name,
        similarity: Number(record.similarity ?? 0),
        entity_type: entityType,
      },
    ];
  }

  return [];
}

function normalizeArrayPayload(input: unknown): SearchEntityMatch[] {
  return Array.isArray(input) ? (input as SearchEntityMatch[]) : [];
}

function classifyOutcome(matches: SearchEntityMatch[]) {
  const [top, second] = matches;

  if (!top) {
    return { outcome: "new" as const, similarity: null };
  }

  if (top.similarity >= AUTO_MATCH_THRESHOLD && (!second || top.similarity - second.similarity >= AMBIGUOUS_MARGIN)) {
    return { outcome: "matched" as const, similarity: top.similarity };
  }

  if (top.similarity >= AMBIGUOUS_THRESHOLD) {
    return { outcome: "ambiguous" as const, similarity: top.similarity };
  }

  return { outcome: "new" as const, similarity: top.similarity };
}

export interface EntityResolutionStageResult {
  skipped: boolean;
  idempotencyKey: string;
  extractor: ReturnType<typeof buildProvenance>;
  output: EntityResolutionResult;
}

export async function runEntityResolutionStage(
  artifactId: number,
  classification: ClassificationResult,
  extraction: EntityExtractionResult,
): Promise<EntityResolutionStageResult> {
  const supabase = createAdminSupabaseClient();
  const extractor = buildProvenance({
    name: "resolve-entities-v1",
    version: RESOLUTION_VERSION,
    model: "database-driven",
    prompt: "database-driven-resolution",
  });
  const idempotencyKey = buildIdempotencyKey(artifactId, extractor.version, {
    classification,
    extraction,
  });
  const existing = await findExistingCompletedJob<EntityResolutionResult>(
    supabase,
    artifactId,
    "resolve_entities",
    idempotencyKey,
  );

  if (existing) {
    return {
      skipped: true,
      idempotencyKey,
      extractor,
      output: EntityResolutionResultSchema.parse(existing.payload.output),
    };
  }

  const jobId = await startProcessingJob(supabase, artifactId, "resolve_entities", idempotencyKey, extractor);

  try {
    const resolvedPartners = await Promise.all(
      extraction.partners.map(async (partner) => {
        const { data: resolvedSupplier, error: resolveError } = await callRpcJson(supabase, "resolve_supplier", {
          p_name: partner.name,
        });

        if (resolveError) {
          throw new Error(`Failed resolve_supplier for ${partner.name}: ${resolveError.message}`);
        }

        const { data: ranked, error: searchError } = await callRpcJson(supabase, "search_entities_fuzzy", {
          p_query: partner.name,
          p_entity_type: "partner",
        });

        if (searchError) {
          throw new Error(`Failed partner search for ${partner.name}: ${searchError.message}`);
        }

        // Email domain matching per §7.2 Stage 3
        const domains = collectDomainsForPartner(partner.name, extraction.contacts);
        const domainMatches: SearchEntityMatch[] = [];
        for (const domain of domains) {
          const client = asQueryClient(supabase);
          const { data: domainPartner, error: domainError } = await client
            .from("partners")
            .select("partner_id,name,domain")
            .eq("domain", domain)
            .maybeSingle();

          if (!domainError && domainPartner) {
            const typed = domainPartner as unknown as PartnerDomainMatch;
            domainMatches.push({
              entity_id: typed.partner_id,
              name: typed.name,
              similarity: DOMAIN_MATCH_SIMILARITY,
              entity_type: "partner",
            });
          }
        }

        const topResolved = normalizeResolvedEntity(resolvedSupplier, "partner");
        const searchCandidates = normalizeArrayPayload(ranked).slice(0, 3);
        const candidates = [...domainMatches, ...topResolved, ...searchCandidates].reduce<SearchEntityMatch[]>(
          (acc, candidate) => {
            if (candidate?.entity_id && !acc.some((entry) => entry.entity_id === candidate.entity_id)) {
              acc.push(candidate);
            }
            return acc;
          },
          [],
        );
        candidates.sort((a, b) => b.similarity - a.similarity);
        const outcome = classifyOutcome(candidates);

        return {
          input_name: partner.name,
          outcome: outcome.outcome,
          matched_partner_id: outcome.outcome === "matched" ? candidates[0]?.entity_id ?? null : null,
          similarity: outcome.similarity,
          candidates,
        };
      }),
    );

    const resolvedContacts = await Promise.all(
      extraction.contacts.map(async (contact) => {
        if (contact.email) {
          const { data: exactContact, error } = await supabase
            .from("contacts")
            .select("contact_id,name,email")
            .eq("email", contact.email)
            .maybeSingle();
          const typedExactContact = exactContact as ExactContactMatch | null;

          if (error) {
            throw new Error(`Failed exact contact lookup for ${contact.email}: ${error.message}`);
          }

          if (typedExactContact) {
            return {
              input_name: contact.name,
              input_email: contact.email,
              outcome: "matched" as const,
              matched_contact_id: typedExactContact.contact_id,
              similarity: 1,
              candidates: [
                {
                  entity_id: typedExactContact.contact_id,
                  name: typedExactContact.name,
                  similarity: 1,
                  entity_type: "contact" as const,
                },
              ],
            };
          }
        }

        const { data: ranked, error: searchError } = await callRpcJson(supabase, "search_entities_fuzzy", {
          p_query: contact.email ?? contact.name,
          p_entity_type: "contact",
        });

        if (searchError) {
          throw new Error(`Failed contact search for ${contact.email ?? contact.name}: ${searchError.message}`);
        }

        const candidates = normalizeArrayPayload(ranked).slice(0, 3);
        const outcome = classifyOutcome(candidates);

        return {
          input_name: contact.name,
          input_email: contact.email,
          outcome: outcome.outcome,
          matched_contact_id: outcome.outcome === "matched" ? candidates[0]?.entity_id ?? null : null,
          similarity: outcome.similarity,
          candidates,
        };
      }),
    );

    const resolvedSkus = await Promise.all(
      extraction.skus.map(async (sku) => {
        const { data: resolvedSku, error: resolveError } = await callRpcJson(supabase, "resolve_sku", {
          p_text: sku.reference,
        });

        if (resolveError) {
          throw new Error(`Failed resolve_sku for ${sku.reference}: ${resolveError.message}`);
        }

        const { data: ranked, error: searchError } = await callRpcJson(supabase, "search_entities_fuzzy", {
          p_query: sku.reference,
          p_entity_type: "sku",
        });

        if (searchError) {
          throw new Error(`Failed sku search for ${sku.reference}: ${searchError.message}`);
        }

        const topResolved = normalizeResolvedEntity(resolvedSku, "sku");
        const searchCandidates = normalizeArrayPayload(ranked).slice(0, 3);
        const candidates = [...topResolved, ...searchCandidates].reduce<SearchEntityMatch[]>((acc, candidate) => {
          if (candidate?.entity_id && !acc.some((entry) => entry.entity_id === candidate.entity_id)) {
            acc.push(candidate);
          }

          return acc;
        }, []);
        const outcome = classifyOutcome(candidates);

        return {
          input_reference: sku.reference,
          outcome: outcome.outcome,
          matched_sku_id: outcome.outcome === "matched" ? candidates[0]?.entity_id ?? null : null,
          similarity: outcome.similarity,
          candidates,
        };
      }),
    );

    const result = EntityResolutionResultSchema.parse({
      partners: resolvedPartners,
      contacts: resolvedContacts,
      skus: resolvedSkus,
      review_required:
        resolvedPartners.some((entry) => entry.outcome !== "matched") ||
        resolvedContacts.some((entry) => entry.outcome !== "matched") ||
        resolvedSkus.some((entry) => entry.outcome !== "matched"),
      schema_version: "v1",
    });

    await completeProcessingJob(supabase, jobId, {
      artifactId,
      idempotencyKey,
      extractor,
      output: result,
    });

    return {
      skipped: false,
      idempotencyKey,
      extractor,
      output: result,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Unknown entity resolution error for payload ${stableStringify(extraction)}`;

    await failProcessingJob(supabase, jobId, {
      artifactId,
      idempotencyKey,
      extractor,
      error: message,
    });
    throw error;
  }
}
