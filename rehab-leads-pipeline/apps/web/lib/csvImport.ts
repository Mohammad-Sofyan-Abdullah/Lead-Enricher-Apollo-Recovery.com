import Papa from "papaparse";
import type { RawCenter } from "@pipeline/types";

// ── Column aliases ────────────────────────────────────────────────────────────

const NAME_ALIASES = new Set([
  "center name", "name", "center_name", "centername",
]);

const WEBSITE_ALIASES = new Set([
  "website url", "website", "url", "website_url", "websiteurl",
]);

const SOURCE_ALIASES = new Set([
  "source page", "source", "source_page", "sourcepage",
  "source_url", "sourceurl",
]);

function findKey(fields: string[], aliases: Set<string>): string | undefined {
  return fields.find((f) => aliases.has(f.toLowerCase()));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ColumnMapping = {
  name: string | null;
  website: string | null;
  sourcePage: string | null;
};

export type CSVParseResult = {
  centers: RawCenter[];
  totalRows: number;
  skippedRows: number;
  headers: string[];
  rawRows: Record<string, string>[];
  detectedColumns: ColumnMapping;
  warnings: string[];
  errors: string[];
};

// ── File type detection ───────────────────────────────────────────────────────

export async function detectFileType(
  file: File
): Promise<"csv" | "xlsx" | "xls" | "binary" | "unknown"> {
  // Read first 4 bytes to check magic numbers
  const headerBuffer = await file.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(headerBuffer);

  // XLSX / ZIP: 50 4B 03 04
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "xlsx";
  }

  // Old XLS (Compound Binary / CFB): D0 CF 11 E0
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return "xls";
  }

  // Scan up to 4 KB for null bytes — presence indicates binary content
  const sampleBuffer = await file.slice(0, 4096).arrayBuffer();
  const sample = new Uint8Array(sampleBuffer);
  for (const byte of sample) {
    if (byte === 0x00) return "binary";
  }

  return "csv";
}

// ── Core CSV functions ────────────────────────────────────────────────────────

export function buildCentersFromMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): { centers: RawCenter[]; skippedRows: number; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!mapping.name) {
    errors.push("CSV must have a Center Name column");
    return { centers: [], skippedRows: rows.length, warnings, errors };
  }
  if (!mapping.website) {
    warnings.push("No Website URL column found — all centers will use name search");
  }
  if (!mapping.sourcePage) {
    warnings.push("No Source Page column found — source page will be empty");
  }

  let skippedRows = 0;
  const centers: RawCenter[] = [];

  for (const row of rows) {
    const name = (row[mapping.name] ?? "").trim();
    if (!name) { skippedRows++; continue; }
    centers.push({
      name,
      website: mapping.website ? (row[mapping.website] ?? "").trim() : "",
      sourcePage: mapping.sourcePage ? (row[mapping.sourcePage] ?? "").trim() : "",
    });
  }

  return { centers, skippedRows, warnings, errors };
}

export function parseCSVText(csvText: string): CSVParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers: string[] = parsed.meta.fields ?? [];
  const rawRows = parsed.data;

  const detectedColumns: ColumnMapping = {
    name: findKey(headers, NAME_ALIASES) ?? null,
    website: findKey(headers, WEBSITE_ALIASES) ?? null,
    sourcePage: findKey(headers, SOURCE_ALIASES) ?? null,
  };

  const { centers, skippedRows, warnings, errors } =
    buildCentersFromMapping(rawRows, detectedColumns);

  return {
    centers,
    totalRows: rawRows.length,
    skippedRows,
    headers,
    rawRows,
    detectedColumns,
    warnings,
    errors,
  };
}

export function parseCSVFile(file: File): Promise<CSVParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = (e.target?.result as string) ?? "";
        resolve(parseCSVText(text));
      } catch (err) {
        reject(
          new Error(
            `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ── Excel parsing ─────────────────────────────────────────────────────────────

export async function parseXLSXFile(
  file: File,
  sheetName?: string
): Promise<{ result: CSVParseResult; sheetNames: string[] }> {
  // Dynamic import keeps xlsx out of the initial bundle (~500 KB saved)
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const targetSheet = sheetName ?? workbook.SheetNames[0];
  if (!targetSheet) throw new Error("Excel file has no sheets");

  const sheet = workbook.Sheets[targetSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

  const detectedColumns: ColumnMapping = {
    name: findKey(headers, NAME_ALIASES) ?? null,
    website: findKey(headers, WEBSITE_ALIASES) ?? null,
    sourcePage: findKey(headers, SOURCE_ALIASES) ?? null,
  };

  const { centers, skippedRows, warnings, errors } =
    buildCentersFromMapping(rawRows, detectedColumns);

  return {
    sheetNames: workbook.SheetNames,
    result: {
      centers,
      totalRows: rawRows.length,
      skippedRows,
      headers,
      rawRows,
      detectedColumns,
      warnings,
      errors,
    },
  };
}
