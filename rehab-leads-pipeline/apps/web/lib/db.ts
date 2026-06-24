import { supabase, TABLES } from "./supabase";
import type { Center, Lead, Batch } from "./supabase";

export type { Center, Lead, Batch };

// ── Batch ────────────────────────────────────────────────────────────────────

export interface BatchStats {
  total_centers: number;
  enriched: number;
  not_found: number;
  skipped: number;
  discarded: number;
}

export async function getBatchStats(
  batchId: string
): Promise<BatchStats | null> {
  const { data, error } = await supabase
    .from(TABLES.batches)
    .select("total_centers, enriched, not_found, skipped, discarded")
    .eq("id", batchId)
    .single();

  if (error || !data) return null;
  return data as BatchStats;
}

export async function upsertBatch(
  id: string,
  label: string
): Promise<void> {
  await supabase.from(TABLES.batches).upsert({ id, label }, { onConflict: "id" });
}

export async function incrementBatchField(
  batchId: string,
  field: keyof Pick<BatchStats, "enriched" | "not_found" | "skipped" | "discarded">,
  by = 1
): Promise<void> {
  // Use Supabase rpc for atomic increment when available; fall back to read-modify-write
  const { data } = await supabase
    .from(TABLES.batches)
    .select(field)
    .eq("id", batchId)
    .single();

  const current = (data as Record<string, number> | null)?.[field] ?? 0;
  await supabase
    .from(TABLES.batches)
    .update({ [field]: current + by })
    .eq("id", batchId);
}

// ── Centers ──────────────────────────────────────────────────────────────────

export async function upsertCenter(
  center: Omit<Center, "id" | "created_at">
): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLES.centers)
    .upsert(center, { onConflict: "domain" })
    .select("id")
    .single();

  if (error) {
    console.error("upsertCenter error:", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

export async function setCenterStatus(
  centerId: string,
  status: Center["status"],
  skipReason?: string
): Promise<void> {
  await supabase
    .from(TABLES.centers)
    .update({ status, skip_reason: skipReason ?? null })
    .eq("id", centerId);
}

// ── Centers (bulk) ───────────────────────────────────────────────────────────

export interface CenterInsertRow {
  name: string;
  cleanUrl: string;
  sourcePage: string;
  rawUrl: string;
  domain: string;
  noWebsite: boolean;
  sourceMethod: "domain_search" | "name_search";
  status: "valid" | "skipped";
  skipReason?: string;
  note?: string;
}

/**
 * Bulk-inserts a batch of cleaned centers. Maps CleanedCenter fields to DB columns.
 * valid → status 'pending', skipped → status 'skipped'.
 */
export async function saveCenters(
  centers: CenterInsertRow[],
  batchId: string
): Promise<void> {
  if (!centers.length) return;

  const CHUNK = 100;
  const rows = centers.map((c) => ({
    name: c.name,
    website: c.cleanUrl || null,
    source_page: c.sourcePage || null,
    raw_url: c.rawUrl || null,
    domain: c.domain || null,
    no_website: c.noWebsite,
    source_method: c.sourceMethod,
    status: c.status === "valid" ? "pending" : "skipped",
    skip_reason: c.skipReason ?? null,
    batch_id: batchId,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(TABLES.centers)
      .insert(rows.slice(i, i + CHUNK));

    if (error) {
      console.error(`saveCenters error (chunk ${Math.floor(i / CHUNK) + 1}):`, error.message);
    }
  }
}

// ── Leads ────────────────────────────────────────────────────────────────────

export async function upsertLead(
  lead: Omit<Lead, "id" | "created_at">
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.leads)
    .upsert(lead, { onConflict: "apollo_id" });

  if (error) {
    console.error("upsertLead error:", error.message);
  }
}

export async function getLeadsByBatch(batchId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from(TABLES.leads)
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as Lead[];
}
