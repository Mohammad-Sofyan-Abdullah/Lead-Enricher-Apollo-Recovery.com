"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { DownloadButton } from "@/components/DownloadButton";
import type { CleanedCenter } from "@rehab-leads/cleaner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateResult {
  batchId: string;
  summary: {
    total: number;
    valid: number;
    skipped: number;
    noWebsite: number;
    skipReasons: Record<string, number>;
  };
  centers: CleanedCenter[];
}

interface EnrichResult {
  batchId: string;
  enriched: number;
  notFound: number;
  skipped: number;
  discarded: number;
  duplicates: number;
}

type Step = "input" | "preview" | "enriching" | "done" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function centerStatusType(c: CleanedCenter): "valid" | "no_website" | "skipped" {
  if (c.status === "skipped") return "skipped";
  if (c.noWebsite) return "no_website";
  return "valid";
}

function StatusPill({ type }: { type: "valid" | "no_website" | "skipped" }) {
  const map = {
    valid:      "bg-green-100 text-green-800",
    no_website: "bg-yellow-100 text-yellow-800",
    skipped:    "bg-red-100 text-red-800",
  };
  const labels = { valid: "Valid", no_website: "No Website", skipped: "Skipped" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[type]}`}>
      {labels[type]}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewBatchPage() {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>("input");

  // Input form
  const [label, setLabel] = useState("");
  const [rawText, setRawText] = useState("");
  const [cleaning, setCleaning] = useState(false);

  // After clean
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  // Enrichment
  const [progress, setProgress] = useState(0);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Fake progress bar during enrichment
  useEffect(() => {
    if (step !== "enriching") { setProgress(0); return; }
    const id = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + Math.random() * 3 + 1));
    }, 600);
    return () => clearInterval(id);
  }, [step]);

  // ── STEP 1 handlers ─────────────────────────────────────────────────────────

  const handleClean = async () => {
    setCleaning(true);
    try {
      const res = await fetch("/api/batches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), rawText }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.detail ?? json.error ?? "Failed to clean centers");
        return;
      }
      setCreateResult(json as CreateResult);
      setStep("preview");
    } catch (err) {
      toast.error("Request failed: " + String(err));
    } finally {
      setCleaning(false);
    }
  };

  // ── STEP 2 → 3 handler ──────────────────────────────────────────────────────

  const handleEnrich = async () => {
    if (!createResult) return;
    setStep("enriching");
    setProgress(5);
    try {
      const res = await fetch(`/api/batches/${createResult.batchId}/enrich`, {
        method: "POST",
      });
      const json = await res.json();
      setProgress(100);
      if (!res.ok) {
        setErrorMsg(json.detail ?? json.error ?? "Enrichment failed");
        setStep("error");
        return;
      }
      setEnrichResult(json as EnrichResult);
      setStep("done");
    } catch (err) {
      setProgress(0);
      setErrorMsg(String(err));
      setStep("error");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={15} /> Dashboard
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-2xl font-bold text-gray-900">New Batch</h1>
      </div>

      {/* ── STEP 1: Input form ─────────────────────────────────────────────── */}
      {step === "input" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-5 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Aware to Benchmark June 2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paste Centers (tab-separated)
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={
                "Center Name\tWebsite URL\tSource Page URL\nOne center per line. Website and Source Page are optional."
              }
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-navy/40"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleClean}
              disabled={!label.trim() || !rawText.trim() || cleaning}
              className="inline-flex items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-50 transition-colors"
            >
              {cleaning ? (
                <><Loader2 size={15} className="animate-spin" />Cleaning…</>
              ) : (
                "Preview & Clean →"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────────────────────── */}
      {step === "preview" && createResult && (
        <div className="flex flex-col gap-5">
          {/* Summary card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">
              Batch: <span className="text-navy">{label}</span>
            </h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <dt className="text-gray-500">Total centers pasted:</dt>
              <dd className="font-medium">{createResult.summary.total}</dd>
              <dt className="text-gray-500">✅ Valid (ready to search):</dt>
              <dd className="font-medium text-green-700">
                {createResult.summary.valid - createResult.summary.noWebsite}
              </dd>
              <dt className="text-gray-500">🌐 No website (name search):</dt>
              <dd className="font-medium text-yellow-700">
                {createResult.summary.noWebsite}
              </dd>
              <dt className="text-gray-500">❌ Skipped:</dt>
              <dd className="font-medium text-red-700">
                {createResult.summary.skipped}
              </dd>
            </dl>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {["#", "Center Name", "Website", "Source Page", "Status", "Note"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {createResult.centers.map((c, i) => {
                    const type = centerStatusType(c);
                    const dimmed = type === "skipped";
                    return (
                      <tr
                        key={i}
                        className={dimmed ? "opacity-50" : "hover:bg-gray-50"}
                      >
                        <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                        <td
                          className={`px-3 py-2 text-sm font-medium ${dimmed ? "line-through text-gray-500" : "text-gray-900"}`}
                        >
                          {c.name}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate">
                          {c.cleanUrl || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate">
                          {c.sourcePage || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span title={c.skipReason}>
                            <StatusPill type={type} />
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400">
                          {c.note ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Skip breakdown */}
          {createResult.summary.skipped > 0 && (
            <p className="text-xs text-gray-500">
              <span className="font-medium">Skipped breakdown: </span>
              {Object.entries(createResult.summary.skipReasons)
                .map(([reason, count]) => `${reason} (${count})`)
                .join(" · ")}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep("input")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={handleEnrich}
              disabled={createResult.summary.valid === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-50 transition-colors"
            >
              Run Enrichment →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3a: Enriching ─────────────────────────────────────────────── */}
      {step === "enriching" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={36} className="animate-spin text-navy" />
            <p className="text-lg font-semibold text-gray-900">
              🔄 Running enrichment…
            </p>
            <p className="text-sm text-gray-500">
              Searching Apollo for leads…
            </p>
          </div>
          <div className="w-full max-w-md">
            <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-navy rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-right text-xs text-gray-400 mt-1">
              {Math.round(progress)}%
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 3b: Done ──────────────────────────────────────────────────── */}
      {step === "done" && enrichResult && createResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle size={22} />
            <h2 className="text-lg font-semibold">✅ Enrichment Complete</h2>
          </div>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-xs">
            <dt className="text-gray-500">Leads enriched:</dt>
            <dd className="font-semibold text-green-700">{enrichResult.enriched}</dd>
            <dt className="text-gray-500">Not found:</dt>
            <dd className="font-medium">{enrichResult.notFound}</dd>
            <dt className="text-gray-500">Skipped:</dt>
            <dd className="font-medium">{enrichResult.skipped}</dd>
            <dt className="text-gray-500">Discarded (non-US):</dt>
            <dd className="font-medium text-red-600">{enrichResult.discarded}</dd>
            <dt className="text-gray-500">Duplicates skipped:</dt>
            <dd className="font-medium text-gray-500">{enrichResult.duplicates}</dd>
          </dl>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => router.push(`/batches/${createResult.batchId}`)}
              className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90 transition-colors"
            >
              View Batch →
            </button>
            <DownloadButton
              batchId={createResult.batchId}
              format="csv"
              label={label}
            />
            <DownloadButton
              batchId={createResult.batchId}
              format="xlsx"
              label={label}
            />
          </div>
        </div>
      )}

      {/* ── STEP 3c: Error ─────────────────────────────────────────────────── */}
      {step === "error" && (
        <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle size={22} />
            <h2 className="text-lg font-semibold">Enrichment Failed</h2>
          </div>
          <p className="text-sm text-gray-600">{errorMsg || "An unexpected error occurred."}</p>
          <button
            onClick={() => setStep("preview")}
            className="self-start inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
