"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, RefreshCw, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DownloadButton } from "@/components/DownloadButton";
import { formatDate, cn, ENRICH_CHUNK_SIZE } from "@/lib/utils";
import { buildFilename } from "@rehab-leads/exporter";
import type { BatchSummary } from "@/lib/db";

const COLS = "40px 2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 2fr";
const PAGE_SIZE = 20;
const TEST_LABEL = "TestBatch";

function CountBadge({ value, color }: { value: number; color: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", color)}>
      {value ?? 0}
    </span>
  );
}

export function BatchesSection() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [cleanupLabel, setCleanupLabel] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkExporting, setBulkExporting] = useState<"csv" | "xlsx" | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/batches");
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.detail ?? json.error ?? "Failed to load batches");
        return;
      }
      setBatches(json.batches ?? []);
    } catch (err) {
      console.error("[fetchBatches]", err);
      toast.error("Could not load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  // Derived pagination values
  const totalPages = Math.max(1, Math.ceil(batches.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const paginatedBatches = batches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startIdx = batches.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(page * PAGE_SIZE, batches.length);

  // Derived selection values
  const allPageSelected =
    paginatedBatches.length > 0 && paginatedBatches.every((b) => selectedIds.has(b.id));
  const somePageSelected = paginatedBatches.some((b) => selectedIds.has(b.id));
  const selectedBatches = batches.filter((b) => selectedIds.has(b.id));
  const totalSelectedCenters = selectedBatches.reduce((s, b) => s + (b.totalCenters ?? 0), 0);
  const totalSelectedLeads = selectedBatches.reduce((s, b) => s + (b.enriched ?? 0), 0);
  const testBatchCount = batches.filter((b) => b.label === TEST_LABEL).length;

  // Keep select-all checkbox indeterminate state in sync
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  // Keyboard shortcuts: Escape = deselect all, Ctrl/Cmd+A = select current page
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIds(new Set());
      } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedIds(new Set(paginatedBatches.map((b) => b.id)));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paginatedBatches]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedBatches.forEach((b) => next.delete(b.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedBatches.forEach((b) => next.add(b.id));
        return next;
      });
    }
  };

  const handleEnrich = async (id: string) => {
    setEnriching((s) => new Set([...s, id]));

    // Work through the batch a chunk at a time. Each request has to finish inside
    // the gateway's ~30s ceiling, so a large batch takes several passes. Centers
    // already handled are marked in the database, so every pass simply continues
    // where the last one stopped.
    let enriched = 0;
    let notFound = 0;
    let processed = 0;

    try {
      while (true) {
        const res = await fetch(
          `/api/batches/${id}/enrich?limit=${ENRICH_CHUNK_SIZE}`,
          { method: "POST" }
        );
        const json = await res.json();

        if (!res.ok) {
          // Anything already completed is saved; report it rather than losing it.
          if (processed > 0) {
            toast.error(
              `${json.detail ?? "Enrichment failed"} — kept ${enriched} leads from ${processed} centers. Press Enrich again to resume.`
            );
          } else {
            toast.error(json.detail ?? "Enrichment failed");
          }
          return;
        }

        enriched += json.enriched ?? 0;
        notFound += json.notFound ?? 0;
        processed += json.processed ?? 0;

        if (json.done || !json.processed) break;

        toast.loading(
          `Enriching… ${processed} done, ${json.remaining} to go`,
          { id: `enrich-${id}` }
        );
      }

      toast.dismiss(`enrich-${id}`);
      toast.success(`Enriched ${enriched} leads, ${notFound} not found`);
      fetchBatches();
    } catch {
      toast.dismiss(`enrich-${id}`);
      toast.error(
        processed > 0
          ? `Enrichment interrupted — kept ${enriched} leads from ${processed} centers. Press Enrich again to resume.`
          : "Enrichment failed"
      );
    } finally {
      setEnriching((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/batches/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Batch deleted");
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(deleteTarget.id); return next; });
      setBatches((prev) => {
        const next = prev.filter((x) => x.id !== deleteTarget.id);
        const newTotal = Math.max(1, Math.ceil(next.length / PAGE_SIZE));
        setCurrentPage((p) => Math.min(p, newTotal));
        return next;
      });
    } else {
      toast.error("Delete failed");
    }
    setDeleteTarget(null);
  };

  const handleCleanup = async () => {
    if (!cleanupLabel) return;
    setCleaning(true);
    try {
      const res = await fetch("/api/batches/cleanup-test", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: cleanupLabel }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.detail ?? "Cleanup failed");
        return;
      }
      toast.success(`Deleted ${json.deleted} batch${json.deleted !== 1 ? "es" : ""}`);
      setCurrentPage(1);
      setSelectedIds(new Set());
      await fetchBatches();
    } catch {
      toast.error("Cleanup failed");
    } finally {
      setCleaning(false);
      setCleanupLabel(null);
    }
  };

  const handleBulkExport = async (format: "csv" | "xlsx") => {
    if (bulkExporting) return;
    setBulkExporting(format);
    const batchCount = selectedIds.size;
    const toastId = toast.loading("Preparing combined export…");
    try {
      const batchIds = [...selectedIds].join(",");
      const url = `/api/batches/export-combined?batchIds=${encodeURIComponent(batchIds)}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = buildFilename("combined_export", format);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast.success(
        `Downloaded ~${totalSelectedLeads.toLocaleString()} leads from ${batchCount} batch${batchCount !== 1 ? "es" : ""}`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        { id: toastId }
      );
    } finally {
      setBulkExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? "Loading…" : `${batches.length} batch${batches.length !== 1 ? "es" : ""}`}
          </p>
        </div>
        <Link
          href="/batches/new"
          className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90 transition-colors"
        >
          + New Batch
        </Link>
      </div>

      {/* Bulk action toolbar — visible when 1+ rows are selected */}
      {selectedIds.size > 0 && (
        <div className="rounded-xl border border-blue-200 bg-white shadow-md px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              {selectedIds.size} batch{selectedIds.size !== 1 ? "es" : ""} selected
            </span>
            <span className="text-gray-300 select-none">·</span>
            <span className="text-xs text-gray-500">
              {totalSelectedCenters.toLocaleString()} total centers
              {" · "}~{totalSelectedLeads.toLocaleString()} leads
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkExport("csv")}
              disabled={!!bulkExporting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy/90 disabled:opacity-60 transition-colors"
            >
              {bulkExporting === "csv" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              Export CSV
            </button>
            <button
              onClick={() => handleBulkExport("xlsx")}
              disabled={!!bulkExporting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy/90 disabled:opacity-60 transition-colors"
            >
              {bulkExporting === "xlsx" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              Export XLSX
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Grid-based table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 740 }}>

            {/* Header row */}
            <div
              className="grid bg-gray-50 border-b border-gray-200"
              style={{ gridTemplateColumns: COLS }}
            >
              <div className="px-3 py-3 flex items-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  disabled={loading || batches.length === 0}
                  className="w-4 h-4 rounded border-gray-300 accent-navy cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Select all batches on this page"
                />
              </div>
              {["Label", "Date", "Total", "Enriched", "Not Found", "Skipped", "Discarded", "Actions"].map((h) => (
                <div
                  key={h}
                  className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Body */}
            {loading ? (
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="grid border-b border-gray-100 animate-pulse"
                  style={{ gridTemplateColumns: COLS }}
                >
                  {Array.from({ length: 9 }, (_, c) => (
                    <div key={c} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-20" />
                    </div>
                  ))}
                </div>
              ))
            ) : batches.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <p className="text-gray-500 text-sm">No batches yet. Create your first batch to get started.</p>
                <Link
                  href="/batches/new"
                  className="mt-3 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90"
                >
                  Create Batch
                </Link>
              </div>
            ) : (
              paginatedBatches.map((b) => (
                <div
                  key={b.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, input, a")) return;
                    router.push(`/batches/${b.id}`);
                  }}
                  className={cn(
                    "grid border-b border-gray-100 last:border-b-0 transition-colors cursor-pointer",
                    selectedIds.has(b.id) ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"
                  )}
                  style={{ gridTemplateColumns: COLS }}
                >
                  <div className="px-3 py-3 flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      className="w-4 h-4 rounded border-gray-300 accent-navy cursor-pointer"
                      aria-label={`Select batch ${b.label ?? b.id}`}
                    />
                  </div>
                  <div className="py-3">
                    <Link
                      href={`/batches/${b.id}`}
                      className="block px-4 font-semibold text-navy hover:underline"
                    >
                      {b.label ?? "Untitled"}
                    </Link>
                  </div>
                  <div className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(b.createdAt)}
                  </div>
                  <div className="px-4 py-3 text-sm text-gray-700">{b.totalCenters}</div>
                  <div className="px-4 py-3">
                    <CountBadge value={b.enriched} color="bg-green-100 text-green-700" />
                  </div>
                  <div className="px-4 py-3">
                    <CountBadge value={b.notFound} color="bg-gray-100 text-gray-600" />
                  </div>
                  <div className="px-4 py-3">
                    <CountBadge value={b.skipped} color="bg-yellow-100 text-yellow-700" />
                  </div>
                  <div className="px-4 py-3">
                    <CountBadge value={b.discarded} color="bg-red-100 text-red-700" />
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEnrich(b.id)}
                        disabled={enriching.has(b.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy/90 disabled:opacity-60 transition-colors"
                      >
                        {enriching.has(b.id) ? (
                          <><Loader2 size={12} className="animate-spin" />Enriching…</>
                        ) : (
                          <><RefreshCw size={12} />Enrich</>
                        )}
                      </button>
                      <DownloadButton batchId={b.id} format="csv" label={b.label ?? b.id} iconOnly />
                      <button
                        onClick={() => setDeleteTarget({ id: b.id, label: b.label ?? "Untitled" })}
                        className="inline-flex items-center rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete batch"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

          </div>
        </div>

        {/* Pagination footer — only when there are more rows than one page */}
        {!loading && batches.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">
              Showing {startIdx}–{endIdx} of {batches.length} batches
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-xs text-gray-500 tabular-nums">{page} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cleanup link — only visible when TestBatch entries exist */}
      {!loading && testBatchCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setCleanupLabel(TEST_LABEL)}
            disabled={cleaning}
            className="text-xs text-red-400 hover:text-red-600 underline underline-offset-2 transition-colors disabled:opacity-50"
          >
            🗑 Delete all {testBatchCount} &quot;{TEST_LABEL}&quot; test batches
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        setOpen={(o) => !o && setDeleteTarget(null)}
        title={`Delete batch "${deleteTarget?.label}"?`}
        description="This will remove all leads and centers associated with this batch. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!cleanupLabel}
        setOpen={(o) => !o && setCleanupLabel(null)}
        title={`Delete all "${cleanupLabel}" batches?`}
        description={`This will permanently delete ${testBatchCount} batch${testBatchCount !== 1 ? "es" : ""} and all their associated centers and leads. This action cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={handleCleanup}
        onCancel={() => setCleanupLabel(null)}
      />
    </div>
  );
}
