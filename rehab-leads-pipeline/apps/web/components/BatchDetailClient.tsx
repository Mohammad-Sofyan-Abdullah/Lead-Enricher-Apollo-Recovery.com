"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { DownloadButton } from "@/components/DownloadButton";
import { StatCard } from "@/components/StatCard";
import { truncate } from "@/lib/utils";
import type { BatchSummary, BatchStats } from "@/lib/db";
import type { OutputLead } from "@rehab-leads/exporter";
import type { SkippedCenter } from "@rehab-leads/exporter";

interface BatchDetailClientProps {
  batchId: string;
  batch: BatchSummary;
  leads: OutputLead[];
  skipped: SkippedCenter[];
  stats: BatchStats;
}

// Column definitions for the leads table
const leadsColumns: Column<OutputLead>[] = [
  {
    key: "_idx",
    label: "#",
    render: (_row, idx) => (
      <span className="text-gray-400 text-xs">{idx + 1}</span>
    ),
  },
  {
    key: "centerName",
    label: "Center Name",
    sortable: true,
    render: (row) => (
      <span className="font-semibold text-gray-900">{row.centerName}</span>
    ),
  },
  {
    key: "website",
    label: "Website",
    render: (row) =>
      row.website ? (
        <a
          href={row.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-xs"
          title={row.website}
        >
          {truncate(row.website.replace(/^https?:\/\//, ""), 30)}
        </a>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: "sourcePage",
    label: "Source",
    render: (row) =>
      row.sourcePage ? (
        <a
          href={row.sourcePage}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title={row.sourcePage}
        >
          <ExternalLink size={14} />
        </a>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: "name",
    label: "Name",
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: "email",
    label: "Email",
    sortable: true,
    render: (row) =>
      row.email ? (
        <span
          className={
            row.emailStatus === "verified"
              ? "text-verified font-medium text-xs"
              : "text-xs"
          }
        >
          {row.emailStatus === "verified" ? "● " : ""}
          {row.email}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: "linkedinUrl",
    label: "LinkedIn",
    render: (row) =>
      row.linkedinUrl ? (
        <a
          href={row.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-xs"
        >
          View →
        </a>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: "title",
    label: "Title",
    render: (row) => (
      <span title={row.title} className="text-xs">
        {truncate(row.title, 40)}
      </span>
    ),
  },
  {
    key: "sourceMethod",
    label: "Method",
    sortable: true,
    render: (row) => (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          row.sourceMethod === "domain_search"
            ? "bg-blue-100 text-blue-700"
            : "bg-orange-100 text-orange-700"
        }`}
      >
        {row.sourceMethod === "domain_search" ? "Domain" : "Name"}
      </span>
    ),
  },
];

export function BatchDetailClient({
  batchId,
  batch,
  leads,
  skipped,
  stats,
}: BatchDetailClientProps) {
  const router = useRouter();
  const [reEnriching, setReEnriching] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);

  const handleReEnrich = async () => {
    setReEnriching(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/enrich`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.detail ?? "Re-enrichment failed");
        return;
      }
      toast.success(`Enriched ${json.enriched} additional leads`);
      router.refresh();
    } catch {
      toast.error("Re-enrichment failed");
    } finally {
      setReEnriching(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Back + title row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={15} /> All Batches
          </Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-2xl font-bold text-gray-900">
            {batch.label ?? "Untitled Batch"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <DownloadButton batchId={batchId} format="csv" label={batch.label ?? batchId} />
          <DownloadButton batchId={batchId} format="xlsx" label={batch.label ?? batchId} />
          <button
            onClick={handleReEnrich}
            disabled={reEnriching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {reEnriching ? (
              <><Loader2 size={14} className="animate-spin" />Running…</>
            ) : (
              <><RefreshCw size={14} />Re-Enrich</>
            )}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Enriched"  value={stats.enriched}  color="green"  />
        <StatCard label="Not Found" value={stats.notFound}  color="gray"   />
        <StatCard label="Skipped"   value={stats.skipped}   color="yellow" />
        <StatCard label="Discarded" value={stats.discarded} color="red"    />
      </div>

      {/* Leads table */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Leads ({leads.length})
        </h2>
        <DataTable<OutputLead>
          columns={leadsColumns}
          data={leads}
          pageSize={50}
          searchKeys={["name", "centerName", "email"]}
          emptyMessage="No leads found for this batch."
        />
      </div>

      {/* Skipped centers collapsible */}
      {skipped.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <button
            onClick={() => setSkippedOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>Skipped Centers ({skipped.length})</span>
            {skippedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {skippedOpen && (
            <div className="border-t border-gray-200 divide-y divide-gray-100">
              {skipped.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-700">{s.name}</span>
                  <span className="text-xs text-gray-500 text-right max-w-xs">
                    {s.skipReason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
