"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DownloadButton } from "@/components/DownloadButton";
import { formatDate, cn } from "@/lib/utils";
import type { BatchSummary } from "@/lib/db";

function CountBadge({ value, color }: { value: number; color: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", color)}>
      {value}
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: 8 }, (_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 bg-gray-200 rounded w-20" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function BatchesSection() {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/batches");
      if (!res.ok) throw new Error("Failed to load batches");
      const json = await res.json();
      setBatches(json.batches ?? []);
    } catch {
      toast.error("Could not load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const handleEnrich = async (id: string) => {
    setEnriching((s) => new Set([...s, id]));
    try {
      const res = await fetch(`/api/batches/${id}/enrich`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.detail ?? "Enrichment failed");
        return;
      }
      toast.success(`Enriched ${json.enriched} leads, ${json.notFound} not found`);
      fetchBatches();
    } catch {
      toast.error("Enrichment failed");
    } finally {
      setEnriching((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/batches/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Batch deleted");
      setBatches((b) => b.filter((x) => x.id !== deleteTarget.id));
    } else {
      toast.error("Delete failed");
    }
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">All enrichment batches</p>
        </div>
        <Link
          href="/batches/new"
          className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90 transition-colors"
        >
          + New Batch
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {["Label", "Date", "Total", "Enriched", "Not Found", "Skipped", "Discarded", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading ? (
              <SkeletonRows />
            ) : batches.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <p className="text-gray-500 text-sm">
                    No batches yet. Create your first batch to get started.
                  </p>
                  <Link
                    href="/batches/new"
                    className="mt-3 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90"
                  >
                    Create Batch
                  </Link>
                </td>
              </tr>
            ) : (
              batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/batches/${b.id}`}
                      className="font-semibold text-navy hover:underline"
                    >
                      {b.label ?? "Untitled"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(b.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{b.totalCenters}</td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.enriched} color="bg-green-100 text-green-700" />
                  </td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.notFound} color="bg-gray-100 text-gray-600" />
                  </td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.skipped} color="bg-yellow-100 text-yellow-700" />
                  </td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.discarded} color="bg-red-100 text-red-700" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {/* Enrich */}
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

                      {/* Downloads */}
                      <DownloadButton batchId={b.id} format="csv" label={b.label ?? b.id} />
                      <DownloadButton batchId={b.id} format="xlsx" label={b.label ?? b.id} />

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteTarget({ id: b.id, label: b.label ?? "Untitled" })}
                        className="inline-flex items-center rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete batch"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        setOpen={(o) => !o && setDeleteTarget(null)}
        title={`Delete batch "${deleteTarget?.label}"?`}
        description="This will remove all leads and centers associated with this batch. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
