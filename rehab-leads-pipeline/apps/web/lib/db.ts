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
