import { supabase, TABLES } from "./supabase";
import type { Center, CenterStatus, Batch } from "./supabase";
import type { OutputLead, SkippedCenter } from "@rehab-leads/exporter";

export type { Center, Batch };

// ── Exported API shapes ───────────────────────────────────────────────────────

export interface BatchSummary {
  id: string;
  label: string | null;
  totalCenters: number;
  enriched: number;
  notFound: number;
  skipped: number;
  discarded: number;
  createdAt: string;
  updatedAt: string;
}

export interface BatchStats {
  total: number;
  enriched: number;
  notFound: number;
  skipped: number;
  discarded: number;
}

export interface SaveLeadInput {
  apolloId: string;
  centerId: string;
  centerName: string;
  website: string;
  sourcePage: string;
  fullName: string;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  title: string;
  org: string;
  country: string;
  sourceMethod: "domain_search" | "name_search";
}

// ── 1. saveBatch ──────────────────────────────────────────────────────────────

export async function saveBatch(params: {
  id: string;
  label: string;
  totalCenters: number;
}): Promise<void> {
  const { error } = await supabase.from(TABLES.batches).upsert(
    { id: params.id, label: params.label, total_centers: params.totalCenters },
    { onConflict: "id" }
  );
  if (error) throw new Error(`saveBatch: ${error.message}`);
}

// ── 2. saveCenters ────────────────────────────────────────────────────────────

interface CleanedCenterInput {
  name: string;
  cleanUrl?: string;
  sourcePage?: string;
  rawUrl?: string;
  domain?: string;
  noWebsite: boolean;
  sourceMethod: "domain_search" | "name_search";
  status: "valid" | "skipped";
  skipReason?: string;
  note?: string;
}

export async function saveCenters(
  centers: CleanedCenterInput[],
  batchId: string
): Promise<Center[]> {
  if (!centers.length) return [];

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

  const inserted: Center[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await supabase
      .from(TABLES.centers)
      .insert(rows.slice(i, i + CHUNK))
      .select();

    if (error) throw new Error(`saveCenters chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
    if (data) inserted.push(...(data as Center[]));
  }

  return inserted;
}

// ── 3. updateCenterStatus ─────────────────────────────────────────────────────

export async function updateCenterStatus(
  centerId: string,
  status: CenterStatus,
  skipReason?: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.centers)
    .update({ status, skip_reason: skipReason ?? null, updated_at: new Date().toISOString() })
    .eq("id", centerId);

  if (error) throw new Error(`updateCenterStatus: ${error.message}`);
}

// ── 4. saveLead ───────────────────────────────────────────────────────────────
// CRITICAL DEDUP RULE: Before inserting, check if a row with this apollo_id
// already exists in the leads table. If it does, return 'duplicate' immediately
// — do NOT update the existing row, do NOT insert again.

export async function saveLead(
  lead: SaveLeadInput
): Promise<"saved" | "duplicate"> {
  const { data: existing } = await supabase
    .from(TABLES.leads)
    .select("apollo_id")
    .eq("apollo_id", lead.apolloId)
    .maybeSingle();

  if (existing) return "duplicate";

  const { error } = await supabase.from(TABLES.leads).insert({
    apollo_id: lead.apolloId,
    center_id: lead.centerId,
    center_name: lead.centerName,
    website: lead.website || null,
    source_page: lead.sourcePage || null,
    full_name: lead.fullName,
    email: lead.email,
    email_status: lead.emailStatus,
    linkedin_url: lead.linkedinUrl,
    title: lead.title,
    organization: lead.org,
    country: lead.country,
    source_method: lead.sourceMethod,
  });

  if (error) throw new Error(`saveLead: ${error.message}`);
  return "saved";
}

// ── 5. getLeadsByBatch ────────────────────────────────────────────────────────
// Two-step: get center IDs for batch → get leads for those centers.
// Returns OutputLead[] (camelCase, ready for exporter functions).

export async function getLeadsByBatch(batchId: string): Promise<OutputLead[]> {
  const { data: centerRows, error: centerErr } = await supabase
    .from(TABLES.centers)
    .select("id")
    .eq("batch_id", batchId);

  if (centerErr) throw new Error(`getLeadsByBatch (centers): ${centerErr.message}`);
  const centerIds = (centerRows ?? []).map((c: { id: string }) => c.id);
  if (!centerIds.length) return [];

  const { data, error } = await supabase
    .from(TABLES.leads)
    .select("*")
    .in("center_id", centerIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getLeadsByBatch (leads): ${error.message}`);

  return (data ?? []).map((row) => ({
    centerName: row.center_name ?? "",
    website: row.website ?? "",
    sourcePage: row.source_page ?? "",
    name: row.full_name ?? "",
    email: row.email ?? "",
    linkedinUrl: row.linkedin_url ?? "",
    title: row.title ?? "",
    org: row.organization ?? "",
    country: row.country ?? "",
    sourceMethod: row.source_method as "domain_search" | "name_search",
    emailStatus: row.email_status ?? "",
  }));
}

// ── 6. getSkippedCentersByBatch ───────────────────────────────────────────────

export async function getSkippedCentersByBatch(
  batchId: string
): Promise<SkippedCenter[]> {
  const { data, error } = await supabase
    .from(TABLES.centers)
    .select("name, skip_reason, source_page")
    .eq("batch_id", batchId)
    .eq("status", "skipped")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getSkippedCentersByBatch: ${error.message}`);

  return (data ?? []).map((row) => ({
    name: row.name ?? "",
    skipReason: row.skip_reason ?? "",
  }));
}

// ── 7. getBatchStats ──────────────────────────────────────────────────────────
// Reads live counts from the centers table (not the batches cache row).

export async function getBatchStats(batchId: string): Promise<BatchStats> {
  const [totalRes, enrichedRes, notFoundRes, skippedRes, batchRes] =
    await Promise.all([
      supabase
        .from(TABLES.centers)
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId),
      supabase
        .from(TABLES.centers)
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .eq("status", "enriched"),
      supabase
        .from(TABLES.centers)
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .eq("status", "not_found"),
      supabase
        .from(TABLES.centers)
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .eq("status", "skipped"),
      supabase
        .from(TABLES.batches)
        .select("discarded")
        .eq("id", batchId)
        .maybeSingle(),
    ]);

  return {
    total: totalRes.count ?? 0,
    enriched: enrichedRes.count ?? 0,
    notFound: notFoundRes.count ?? 0,
    skipped: skippedRes.count ?? 0,
    discarded: (batchRes.data as { discarded: number } | null)?.discarded ?? 0,
  };
}

// ── 8. updateBatchStats ───────────────────────────────────────────────────────

export async function updateBatchStats(
  batchId: string,
  stats: { enriched: number; notFound: number; skipped: number; discarded: number }
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.batches)
    .update({
      enriched: stats.enriched,
      not_found: stats.notFound,
      skipped: stats.skipped,
      discarded: stats.discarded,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) throw new Error(`updateBatchStats: ${error.message}`);
}

// ── 9. getAllBatches ──────────────────────────────────────────────────────────

export async function getAllBatches(): Promise<BatchSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.batches)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getAllBatches: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    totalCenters: row.total_centers,
    enriched: row.enriched,
    notFound: row.not_found,
    skipped: row.skipped,
    discarded: row.discarded,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ── 10. deleteBatch ───────────────────────────────────────────────────────────
// Delete order: leads → centers → batch (no FK cascade in schema).

export async function deleteBatch(batchId: string): Promise<void> {
  // Step 1: get center IDs for this batch
  const { data: centers, error: centersErr } = await supabase
    .from(TABLES.centers)
    .select("id")
    .eq("batch_id", batchId);

  if (centersErr) throw new Error(`deleteBatch (fetch centers): ${centersErr.message}`);

  const centerIds = (centers ?? []).map((c: { id: string }) => c.id);

  // Step 2: delete leads linked to those centers
  if (centerIds.length > 0) {
    const { error: leadsErr } = await supabase
      .from(TABLES.leads)
      .delete()
      .in("center_id", centerIds);

    if (leadsErr) throw new Error(`deleteBatch (delete leads): ${leadsErr.message}`);
  }

  // Step 3: delete centers
  const { error: centersDelErr } = await supabase
    .from(TABLES.centers)
    .delete()
    .eq("batch_id", batchId);

  if (centersDelErr) throw new Error(`deleteBatch (delete centers): ${centersDelErr.message}`);

  // Step 4: delete the batch row
  const { error: batchErr } = await supabase
    .from(TABLES.batches)
    .delete()
    .eq("id", batchId);

  if (batchErr) throw new Error(`deleteBatch (delete batch): ${batchErr.message}`);
}

// ── getBatchById ──────────────────────────────────────────────────────────────

export async function getBatchById(batchId: string): Promise<BatchSummary | null> {
  const { data, error } = await supabase
    .from(TABLES.batches)
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (error) throw new Error(`getBatchById: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    label: data.label,
    totalCenters: data.total_centers,
    enriched: data.enriched,
    notFound: data.not_found,
    skipped: data.skipped,
    discarded: data.discarded,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── Helpers used by API routes ────────────────────────────────────────────────

export async function getPendingCentersByBatch(batchId: string): Promise<Center[]> {
  const { data, error } = await supabase
    .from(TABLES.centers)
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "pending");

  if (error) throw new Error(`getPendingCentersByBatch: ${error.message}`);
  return (data ?? []) as Center[];
}

export async function getSkippedCount(batchId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.centers)
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("status", "skipped");

  if (error) throw new Error(`getSkippedCount: ${error.message}`);
  return count ?? 0;
}
