"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { ENRICH_CHUNK_SIZE } from "@/lib/utils";
import { DownloadButton } from "@/components/DownloadButton";
import { FileDropzone } from "@/components/FileDropzone";
import { ColumnMapper } from "@/components/ColumnMapper";
import {
  detectFileType,
  parseCSVFile,
  parseXLSXFile,
  buildCentersFromMapping,
  type CSVParseResult,
  type ColumnMapping,
} from "@/lib/csvImport";
import type { CleanedCenter } from "@pipeline/types";

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
type InputTab = "paste" | "csv" | "xlsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

function centerStatusType(c: CleanedCenter): "valid" | "no_website" | "skipped" {
  if (c.status === "skipped") return "skipped";
  if (c.noWebsite) return "no_website";
  return "valid";
}

function StatusPill({ type }: { type: "valid" | "no_website" | "skipped" }) {
  const map = {
    valid: "bg-green-100 text-green-800",
    no_website: "bg-yellow-100 text-yellow-800",
    skipped: "bg-red-100 text-red-800",
  };
  const labels = { valid: "Valid", no_website: "No Website", skipped: "Skipped" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[type]}`}
    >
      {labels[type]}
    </span>
  );
}

// Shared UI for parsed upload result (stats, errors, warnings, mapper, preview)
function UploadResult({
  parseResult,
  mappingResult,
  mapping,
  onMappingChange,
  showMapper,
  showMapperSummary = false,
  onExpandMapper,
  extraHeader,
}: {
  parseResult: CSVParseResult;
  mappingResult: ReturnType<typeof buildCentersFromMapping>;
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
  showMapper: boolean;
  showMapperSummary?: boolean;
  onExpandMapper?: () => void;
  extraHeader?: React.ReactNode;
}) {
  return (
    <>
      {extraHeader}

      {/* Row count */}
      <p className="text-sm text-gray-600">
        Detected <strong>{parseResult.totalRows}</strong> row
        {parseResult.totalRows !== 1 ? "s" : ""} →{" "}
        <strong className="text-green-700">{mappingResult.centers.length}</strong>{" "}
        centers
        {mappingResult.skippedRows > 0 && (
          <span className="text-gray-400">
            {" "}
            ({mappingResult.skippedRows} skipped — empty name)
          </span>
        )}
      </p>

      {/* Errors */}
      {mappingResult.errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex flex-col gap-1">
          {mappingResult.errors.map((e, i) => (
            <p key={i} className="text-sm text-red-700">
              ⚠ {e}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {mappingResult.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex flex-col gap-1">
          {mappingResult.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* Collapsed mapper summary — shown when all 3 columns auto-detected */}
      {showMapperSummary && mapping.name !== null && (
        <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 gap-2">
          <p className="text-sm text-green-700 min-w-0">
            ✅ Columns mapped automatically:{" "}
            <strong>{mapping.name}</strong>
            {mapping.website && (
              <> · <strong>{mapping.website}</strong></>
            )}
            {mapping.sourcePage && (
              <> · <strong>{mapping.sourcePage}</strong></>
            )}
          </p>
          <button
            type="button"
            onClick={onExpandMapper}
            className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 shrink-0"
          >
            Edit mapping
          </button>
        </div>
      )}

      {/* Full column mapper — shown when detection failed or user expanded */}
      {showMapper && (
        <ColumnMapper
          headers={parseResult.headers}
          mapping={mapping}
          onChange={onMappingChange}
        />
      )}

      {/* Preview table */}
      {mappingResult.centers.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <p className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
            Preview (first 5 rows)
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {["Center Name", "Website", "Source Page"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mappingResult.centers.slice(0, 5).map((c, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-sm text-gray-900">{c.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate">
                      {c.website || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate">
                      {c.sourcePage || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewBatchPage() {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>("input");

  // Input form — shared
  const [label, setLabel] = useState("");
  const [inputTab, setInputTab] = useState<InputTab>("paste");
  const [cleaning, setCleaning] = useState(false);

  // Paste tab
  const [rawText, setRawText] = useState("");

  // CSV tab
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFileError, setCsvFileError] = useState<"xlsx" | "xls" | "binary" | "parse_error" | null>(null);
  const [csvParseResult, setCsvParseResult] = useState<CSVParseResult | null>(null);
  const [csvMapping, setCsvMapping] = useState<ColumnMapping>({
    name: null,
    website: null,
    sourcePage: null,
  });
  const [csvParsing, setCsvParsing] = useState(false);

  // Excel tab
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxSheetNames, setXlsxSheetNames] = useState<string[]>([]);
  const [xlsxSelectedSheet, setXlsxSelectedSheet] = useState("");
  const [xlsxParseResult, setXlsxParseResult] = useState<CSVParseResult | null>(null);
  const [xlsxMapping, setXlsxMapping] = useState<ColumnMapping>({
    name: null,
    website: null,
    sourcePage: null,
  });
  const [xlsxParsing, setXlsxParsing] = useState(false);

  // Mapper expand/collapse state (reset on each new file)
  const [csvMapperExpanded, setCsvMapperExpanded] = useState(false);
  const [xlsxMapperExpanded, setXlsxMapperExpanded] = useState(false);

  // Label validation — only show error after first submit attempt
  const [labelError, setLabelError] = useState(false);

  // After clean
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  // Enrichment
  const [progress, setProgress] = useState(0);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Derived CSV mapping result
  const csvMappingResult = useMemo(
    () =>
      csvParseResult
        ? buildCentersFromMapping(csvParseResult.rawRows, csvMapping)
        : null,
    [csvParseResult, csvMapping]
  );

  // Derived Excel mapping result
  const xlsxMappingResult = useMemo(
    () =>
      xlsxParseResult
        ? buildCentersFromMapping(xlsxParseResult.rawRows, xlsxMapping)
        : null,
    [xlsxParseResult, xlsxMapping]
  );

  // All 3 columns auto-detected → show collapsed summary; any null → show full mapper
  const csvAllDetected =
    csvMapping.name !== null &&
    csvMapping.website !== null &&
    csvMapping.sourcePage !== null;
  const showCsvMapperSummary =
    !!csvParseResult && !csvFileError && csvAllDetected && !csvMapperExpanded;
  const showCsvMapper =
    !!csvParseResult && !csvFileError && (!csvAllDetected || csvMapperExpanded);

  const xlsxAllDetected =
    xlsxMapping.name !== null &&
    xlsxMapping.website !== null &&
    xlsxMapping.sourcePage !== null;
  const showXlsxMapperSummary =
    !!xlsxParseResult && xlsxAllDetected && !xlsxMapperExpanded;
  const showXlsxMapper =
    !!xlsxParseResult && (!xlsxAllDetected || xlsxMapperExpanded);

  // Progress is driven by handleEnrich from the work actually remaining, so it no
  // longer needs the timer that used to fake it.
  useEffect(() => {
    if (step !== "enriching") setProgress(0);
  }, [step]);

  // ── CSV file handler ─────────────────────────────────────────────────────────

  const handleCsvFileSelect = async (file: File) => {
    // Keep the file set so the filename stays visible while we detect its type
    setCsvFile(file);
    setCsvFileError(null);
    setCsvParseResult(null);
    setCsvMapperExpanded(false);
    setCsvParsing(true);
    try {
      const type = await detectFileType(file);
      if (type === "xlsx" || type === "xls") {
        setCsvFileError(type);
        return;
      }
      if (type === "binary") {
        setCsvFileError("binary");
        return;
      }
      const result = await parseCSVFile(file);
      setCsvParseResult(result);
      setCsvMapping(result.detectedColumns);
    } catch (err) {
      console.error("[CSV parse]", err);
      setCsvFileError("parse_error");
    } finally {
      setCsvParsing(false);
    }
  };

  const handleClearCsv = () => {
    setCsvFile(null);
    setCsvFileError(null);
    setCsvParseResult(null);
    setCsvMapperExpanded(false);
    setCsvMapping({ name: null, website: null, sourcePage: null });
  };

  // ── Excel file handler ───────────────────────────────────────────────────────

  const handleXlsxFileSelect = async (file: File) => {
    setXlsxFile(file);
    setXlsxParsing(true);
    setXlsxParseResult(null);
    setXlsxMapperExpanded(false);
    setXlsxSheetNames([]);
    try {
      const type = await detectFileType(file);
      if (type === "csv") {
        toast.error("CSV file detected", {
          description: "Switch to the Upload CSV tab to upload this file.",
        });
        setXlsxFile(null);
        return;
      }
      if (type === "binary" || type === "unknown") {
        toast.error("Unrecognised file", {
          description:
            "This file could not be recognised as a valid Excel file. Please upload a .xlsx or .xls file.",
        });
        setXlsxFile(null);
        return;
      }
      const { result, sheetNames } = await parseXLSXFile(file);
      setXlsxSheetNames(sheetNames);
      setXlsxSelectedSheet(sheetNames[0] ?? "");
      setXlsxParseResult(result);
      setXlsxMapping(result.detectedColumns);
    } catch (err) {
      toast.error(
        `Failed to parse Excel file: ${err instanceof Error ? err.message : String(err)}`
      );
      setXlsxFile(null);
    } finally {
      setXlsxParsing(false);
    }
  };

  const handleXlsxSheetChange = async (sheetName: string) => {
    if (!xlsxFile) return;
    setXlsxSelectedSheet(sheetName);
    setXlsxParsing(true);
    try {
      const { result } = await parseXLSXFile(xlsxFile, sheetName);
      setXlsxParseResult(result);
      setXlsxMapping(result.detectedColumns);
    } catch (err) {
      toast.error(
        `Failed to read sheet: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setXlsxParsing(false);
    }
  };

  const handleClearXlsx = () => {
    setXlsxFile(null);
    setXlsxSheetNames([]);
    setXlsxSelectedSheet("");
    setXlsxParseResult(null);
    setXlsxMapperExpanded(false);
    setXlsxMapping({ name: null, website: null, sourcePage: null });
  };

  // ── STEP 1 handler ───────────────────────────────────────────────────────────

  const handleClean = async () => {
    if (!label.trim()) { toast.error("Batch label is required"); return; }
    setCleaning(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: Record<string, any>;

      if (inputTab === "paste") {
        if (!rawText.trim()) return;
        body = { label: label.trim(), rawText };
      } else if (inputTab === "csv") {
        if (!csvParseResult || !csvMappingResult) return;
        if (csvMappingResult.errors.length > 0) {
          toast.error(csvMappingResult.errors[0]); return;
        }
        if (csvMappingResult.centers.length === 0) {
          toast.error("No valid centers found in CSV"); return;
        }
        body = { label: label.trim(), centers: csvMappingResult.centers };
      } else {
        if (!xlsxParseResult || !xlsxMappingResult) return;
        if (xlsxMappingResult.errors.length > 0) {
          toast.error(xlsxMappingResult.errors[0]); return;
        }
        if (xlsxMappingResult.centers.length === 0) {
          toast.error("No valid centers found in Excel file"); return;
        }
        body = { label: label.trim(), centers: xlsxMappingResult.centers };
      }

      const res = await fetch("/api/batches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const canSubmit =
    !!label.trim() &&
    !cleaning &&
    (inputTab === "paste"
      ? !!rawText.trim()
      : inputTab === "csv"
      ? !!csvParseResult && !csvFileError && csvMapping.name !== null
      : !!xlsxParseResult && xlsxMapping.name !== null);

  // Inline nudge above the button when the only blocker is a missing Center Name mapping
  const showNameColumnError =
    !canSubmit &&
    !cleaning &&
    !!label.trim() &&
    ((inputTab === "csv" &&
      !!csvParseResult &&
      !csvFileError &&
      csvMapping.name === null) ||
      (inputTab === "xlsx" &&
        !!xlsxParseResult &&
        xlsxMapping.name === null));

  // ── STEP 2 → 3 handler ──────────────────────────────────────────────────────

  const handleEnrich = async () => {
    if (!createResult) return;
    setStep("enriching");
    setProgress(0);

    // Each request must finish inside the gateway's ~30s ceiling, so the batch is
    // worked through a chunk at a time. Processed centers are recorded in the
    // database, so every pass continues where the last one stopped — and an
    // interrupted run keeps everything it already completed.
    const totals: EnrichResult = {
      batchId: createResult.batchId,
      enriched: 0,
      notFound: 0,
      skipped: 0,
      discarded: 0,
      duplicates: 0,
    };
    let processed = 0;
    let lastRemaining = Infinity;

    try {
      while (true) {
        const res = await fetch(
          `/api/batches/${createResult.batchId}/enrich?limit=${ENRICH_CHUNK_SIZE}`,
          { method: "POST" }
        );
        const json = await res.json();

        if (!res.ok) {
          setErrorMsg(
            processed > 0
              ? `${json.detail ?? json.error ?? "Enrichment failed"} — ${totals.enriched} leads from ${processed} centers were saved. Try Again resumes from there.`
              : json.detail ?? json.error ?? "Enrichment failed"
          );
          setStep("error");
          return;
        }

        totals.enriched += json.enriched ?? 0;
        totals.notFound += json.notFound ?? 0;
        totals.discarded += json.discarded ?? 0;
        totals.duplicates += json.duplicates ?? 0;
        totals.skipped = json.skipped ?? totals.skipped;
        processed += json.processed ?? 0;

        // Real progress, measured against work actually remaining.
        const remaining = json.remaining ?? 0;
        setProgress(
          processed + remaining > 0
            ? Math.round((processed / (processed + remaining)) * 100)
            : 100
        );

        // `!json.processed` guards against an empty pass so this can never spin.
        if (json.done || !json.processed) break;

        // Every pass must leave less to do; stop rather than loop forever if not.
        if (remaining >= lastRemaining) {
          setErrorMsg(
            `Enrichment stalled with ${remaining} centers left — ${totals.enriched} leads from ${processed} centers were saved. Try Again resumes from there.`
          );
          setStep("error");
          return;
        }
        lastRemaining = remaining;
      }

      setProgress(100);
      setEnrichResult(totals);
      setStep("done");
    } catch (err) {
      setErrorMsg(
        processed > 0
          ? `${String(err)} — ${totals.enriched} leads from ${processed} centers were saved. Try Again resumes from there.`
          : String(err)
      );
      setStep("error");
    }
  };

  // ── Tab button helper ────────────────────────────────────────────────────────

  function TabBtn({
    id,
    label: tabLabel,
  }: {
    id: InputTab;
    label: string;
  }) {
    return (
      <button
        type="button"
        onClick={() => setInputTab(id)}
        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          inputTab === id
            ? "border-navy text-navy"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        {tabLabel}
      </button>
    );
  }

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
          {/* Batch label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (e.target.value.trim()) setLabelError(false);
              }}
              placeholder="e.g. Aware to Benchmark June 2026"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/40 ${
                labelError && !label.trim()
                  ? "border-red-400 focus:ring-red-400/40"
                  : "border-gray-300"
              }`}
            />
            {labelError && !label.trim() && (
              <p className="mt-1 text-xs text-red-600">Batch Label is required to proceed.</p>
            )}
          </div>

          {/* Tabs */}
          <div>
            <div className="flex border-b border-gray-200 mb-4">
              <TabBtn id="paste" label="📋 Paste Text" />
              <TabBtn id="csv" label="📂 Upload CSV" />
              <TabBtn id="xlsx" label="📊 Upload Excel (.xlsx)" />
            </div>

            {/* ── Tab 1: Paste ──────────────────────────────────────────── */}
            {inputTab === "paste" && (
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
            )}

            {/* ── Tab 2: Upload CSV ─────────────────────────────────────── */}
            {inputTab === "csv" && (
              <div className="flex flex-col gap-4">
                <FileDropzone
                  onFileSelect={handleCsvFileSelect}
                  onClear={handleClearCsv}
                  selectedFile={csvFile}
                  accept=".csv,.txt"
                  maxSizeMB={5}
                />

                {/* Inline banner — shown below the filename chip so the user knows what was detected */}
                {(csvFileError === "xlsx" || csvFileError === "xls") && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex flex-col gap-1.5">
                    <p className="text-sm font-semibold text-red-800">
                      ❌ This is an Excel file (.xlsx), not a CSV.
                    </p>
                    <p className="text-sm text-red-700">
                      To fix: In Excel, go to{" "}
                      <strong>File → Save As → CSV UTF-8 (Comma delimited) (.csv)</strong>
                      , then upload again.
                    </p>
                    <p className="text-sm text-red-700">
                      Or switch to the <strong>Upload Excel (.xlsx)</strong> tab above.
                    </p>
                  </div>
                )}
                {csvFileError === "binary" && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-700">
                      ❌ This file appears to be binary or corrupted. Please upload a plain text
                      CSV file.
                    </p>
                  </div>
                )}
                {csvFileError === "parse_error" && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-700">
                      ❌ Could not parse this file. Please check it&apos;s a valid CSV and try
                      again.
                    </p>
                  </div>
                )}

                {csvParsing && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    Parsing CSV…
                  </div>
                )}

                {csvParseResult && !csvParsing && csvMappingResult && (
                  <UploadResult
                    parseResult={csvParseResult}
                    mappingResult={csvMappingResult}
                    mapping={csvMapping}
                    onMappingChange={setCsvMapping}
                    showMapper={showCsvMapper}
                    showMapperSummary={showCsvMapperSummary}
                    onExpandMapper={() => setCsvMapperExpanded(true)}
                  />
                )}
              </div>
            )}

            {/* ── Tab 3: Upload Excel ───────────────────────────────────── */}
            {inputTab === "xlsx" && (
              <div className="flex flex-col gap-4">
                <FileDropzone
                  onFileSelect={handleXlsxFileSelect}
                  onClear={handleClearXlsx}
                  selectedFile={xlsxFile}
                  accept=".xlsx,.xls"
                  maxSizeMB={20}
                  helpText="First sheet is read automatically. Columns: Center Name, Website URL, Source Page"
                />

                {xlsxParsing && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    Reading Excel file…
                  </div>
                )}

                {xlsxParseResult && !xlsxParsing && xlsxMappingResult && (
                  <UploadResult
                    parseResult={xlsxParseResult}
                    mappingResult={xlsxMappingResult}
                    mapping={xlsxMapping}
                    onMappingChange={setXlsxMapping}
                    showMapper={showXlsxMapper}
                    showMapperSummary={showXlsxMapperSummary}
                    onExpandMapper={() => setXlsxMapperExpanded(true)}
                    extraHeader={
                      xlsxSheetNames.length > 1 ? (
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            Sheet:
                          </label>
                          <select
                            value={xlsxSelectedSheet}
                            onChange={(e) =>
                              handleXlsxSheetChange(e.target.value)
                            }
                            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/40 bg-white"
                          >
                            {xlsxSheetNames.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-gray-400">
                            {xlsxSheetNames.length} sheets found
                          </span>
                        </div>
                      ) : undefined
                    }
                  />
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex flex-col gap-2">
            {showNameColumnError && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ <strong>Center Name is required to proceed.</strong> Please select the correct
                column from the dropdown above.
              </p>
            )}
            {/* Wrapper captures clicks even when the button is disabled */}
            <div
              className="flex justify-end"
              onClick={() => {
                if (!canSubmit && !label.trim()) setLabelError(true);
              }}
            >
              <button
                onClick={handleClean}
                disabled={!canSubmit}
                className={`inline-flex items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-50 transition-colors ${!canSubmit ? "pointer-events-none" : ""}`}
              >
                {cleaning ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Cleaning…
                  </>
                ) : (
                  "Preview & Clean →"
                )}
              </button>
            </div>
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
                    {["#", "Center Name", "Website", "Source Page", "Status", "Note"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      )
                    )}
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
                          className={`px-3 py-2 text-sm font-medium ${
                            dimmed ? "line-through text-gray-500" : "text-gray-900"
                          }`}
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
                          <span title={c.skipReason ?? undefined}>
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
            <p className="text-sm text-gray-500">Searching Apollo for leads…</p>
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
          <p className="text-sm text-gray-600">
            {errorMsg || "An unexpected error occurred."}
          </p>
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
