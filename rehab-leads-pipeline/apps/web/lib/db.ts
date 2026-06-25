import { supabase, TABLES } from "./supabase";
import type { CenterStatus } from "./supabase";
import type {
  Center,
  CleanedCenter,
  OutputLead,
  SkippedCenter,
  BatchStats,
} from "@pipeline/types";

// Re-export shared types consumed by components
export type { BatchStats };

// ── Local types ───────────────────────────────────────────────────────────────

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

// ── Internal DB row type (snake_case, mirrors Supabase schema) ────────────────

interface DbCenterRow {
  id: string;
  name: string;
  website: string | null;
  source_page: string | null;
  raw_url: string | null;
  domain: string | null;
  no_website: boolean;
  source_method: "domain_search" | "name_search";
  status: "pending" | "enriched" | "not_found" | "skipped";
  skip_reason: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapCenter(row: DbCenterRow): Center {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    sourcePage: row.source_page,
    rawUrl: row.raw_url,
    domain: row.domain,
    noWebsite: row.no_website,
    sourceMethod: row.source_method,
    status: row.status,
    skipReason: row.skip_reason,
    batchId: row.batch_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  if (error) throw new Error(`DB error in saveBatch: ${error.message}`);
}

// ── 2. saveCenters ────────────────────────────────────────────────────────────

export async function saveCenters(
  centers: CleanedCenter[],
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

    if (error) throw new Error(`DB error in saveCenters chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
    if (data) inserted.push(...(data as DbCenterRow[]).map(mapCenter));
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
    .update({ status, skip_reason: skipReason ?? null })
    .eq("id", centerId);

  if (error) throw new Error(`DB error in updateCenterStatus: ${error.message}`);
}

// ── 4. saveLead ───────────────────────────────────────────────────────────────
// CRITICAL DEDUP RULE: check apollo_id first. If already exists, return
// "duplicate" immediately — never update or re-insert the same person.

export async function saveLead(
  lead: SaveLeadInput
): Promise<"saved" | "duplicate"> {
  const { data: existing, error: checkErr } = await supabase
    .from(TABLES.leads)
    .select("apollo_id")
    .eq("apollo_id", lead.apolloId)
    .maybeSingle();

  if (checkErr) throw new Error(`DB error in saveLead (check): ${checkErr.message}`);
  if (existing) return "duplicate";

  const insertData = {
    apollo_id: lead.apolloId,
    center_id: lead.centerId,
    center_name: lead.centerName,
    website: lead.website ?? null,
    full_name: lead.fullName,
    email: lead.email ?? null,
    linkedin_url: lead.linkedinUrl ?? null,
    title: lead.title ?? null,
    organization: lead.org ?? null,
    email_status: lead.emailStatus ?? null,
    country: lead.country ?? null,
    source_method: lead.sourceMethod ?? "domain_search",
    ...(lead.sourcePage != null ? { source_page: lead.sourcePage } : {}),
  };

  const { error } = await supabase.from(TABLES.leads).insert(insertData);

  if (error) throw new Error(`DB error in saveLead (insert): ${error.message}`);
  return "saved";
}

// ── 5. getLeadsByBatch ────────────────────────────────────────────────────────
// Two-step: get center IDs for batch → get leads for those centers.

export async function getLeadsByBatch(batchId: string): Promise<OutputLead[]> {
  const { data: centerRows, error: centerErr } = await supabase
    .from(TABLES.centers)
    .select("id")
    .eq("batch_id", batchId);

  if (centerErr) throw new Error(`DB error in getLeadsByBatch (centers): ${centerErr.message}`);
  const centerIds = (centerRows ?? []).map((c: { id: string }) => c.id);
  if (!centerIds.length) return [];

  // Chunk into 50-ID slices to avoid URL length limits in PostgREST
  const CHUNK = 50;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows: any[] = [];
  for (let i = 0; i < centerIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from(TABLES.leads)
      .select("*")
      .in("center_id", centerIds.slice(i, i + CHUNK))
      .order("created_at", { ascending: true });
    if (error) throw new Error(`DB error in getLeadsByBatch (leads): ${error.message}`);
    if (data) allRows.push(...data);
  }

  return allRows.map((row) => ({
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

  if (error) throw new Error(`DB error in getSkippedCentersByBatch: ${error.message}`);

  return (data ?? []).map((row) => ({
    name: row.name ?? "",
    skipReason: row.skip_reason ?? "",
    sourcePage: row.source_page ?? "",
  }));
}

// ── 7. getBatchStats ──────────────────────────────────────────────────────────

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

  if (totalRes.error) throw new Error(`DB error in getBatchStats (total): ${totalRes.error.message}`);

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
    })
    .eq("id", batchId);

  if (error) throw new Error(`DB error in updateBatchStats: ${error.message}`);
}

// ── 9. getAllBatches ──────────────────────────────────────────────────────────

export async function getAllBatches(): Promise<BatchSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.batches)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error(`DB error in getAllBatches: ${error.message}`);

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

export async function deleteBatch(batchId: string): Promise<void> {
  const { data: centers, error: centersErr } = await supabase
    .from(TABLES.centers)
    .select("id")
    .eq("batch_id", batchId);

  if (centersErr) throw new Error(`DB error in deleteBatch (fetch centers): ${centersErr.message}`);

  const centerIds = (centers ?? []).map((c: { id: string }) => c.id);

  if (centerIds.length > 0) {
    const { error: leadsErr } = await supabase
      .from(TABLES.leads)
      .delete()
      .in("center_id", centerIds);

    if (leadsErr) throw new Error(`DB error in deleteBatch (delete leads): ${leadsErr.message}`);
  }

  const { error: centersDelErr } = await supabase
    .from(TABLES.centers)
    .delete()
    .eq("batch_id", batchId);

  if (centersDelErr) throw new Error(`DB error in deleteBatch (delete centers): ${centersDelErr.message}`);

  const { error: batchErr } = await supabase
    .from(TABLES.batches)
    .delete()
    .eq("id", batchId);

  if (batchErr) throw new Error(`DB error in deleteBatch (delete batch): ${batchErr.message}`);
}

// ── 11. getBatchById ──────────────────────────────────────────────────────────

export async function getBatchById(batchId: string): Promise<BatchSummary | null> {
  const { data, error } = await supabase
    .from(TABLES.batches)
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (error) throw new Error(`DB error in getBatchById: ${error.message}`);
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

  if (error) throw new Error(`DB error in getPendingCentersByBatch: ${error.message}`);
  return (data ?? []).map((row) => mapCenter(row as DbCenterRow));
}

export async function getSkippedCount(batchId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLES.centers)
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("status", "skipped");

  if (error) throw new Error(`DB error in getSkippedCount: ${error.message}`);
  return count ?? 0;
}
