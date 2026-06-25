import Papa from "papaparse";
import ExcelJS from "exceljs";
import { format as dateFmt } from "date-fns";
import type { OutputLead, SkippedCenter } from "@pipeline/types";

// Re-export for backward compatibility
export type { OutputLead, SkippedCenter };

// ── Internal constants ─────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Center_Name",
  "Website",
  "Source_Page",
  "Name",
  "Email",
  "LinkedIn_URL",
  "Title",
  "Organization",
  "Email_Status",
  "Source_Method",
  "Country",
] as const;

const XLSX_COLUMNS = [
  { header: "Center Name",  key: "centerName"  },
  { header: "Website",      key: "website"     },
  { header: "Source Page",  key: "sourcePage"  },
  { header: "Name",         key: "name"        },
  { header: "Email",        key: "email"       },
  { header: "LinkedIn URL", key: "linkedinUrl" },
  { header: "Title",        key: "title"       },
  { header: "Organization", key: "organization"},
  { header: "Email Status", key: "emailStatus" },
  { header: "Source Method",key: "sourceMethod"},
  { header: "Country",      key: "country"     },
] as const;

// Skip reason → display category
const SKIP_CATEGORY_RULES: Array<[RegExp | string, string]> = [
  [/^iubenda/i,               "iubenda placeholder"   ],
  [/^ctcprograms/i,           "ctcprograms.com"        ],
  [/international tld/i,      "International TLD"      ],
  [/international center/i,   "International center"   ],
  [/government|county/i,      "Government/county site" ],
  ["invalid_url",             "Invalid URL"            ],
];

const SKIP_DISPLAY_ORDER = [
  "iubenda placeholder",
  "ctcprograms.com",
  "International TLD",
  "International center",
  "Government/county site",
  "Invalid URL",
  "Other",
] as const;

function getSkipCategory(reason: string): string {
  for (const [matcher, label] of SKIP_CATEGORY_RULES) {
    if (typeof matcher === "string" ? reason === matcher : matcher.test(reason)) {
      return label;
    }
  }
  return "Other";
}

// ── 1. exportCSV ───────────────────────────────────────────────────────────────

export function exportCSV(leads: OutputLead[]): string {
  try {
    const filtered = leads.filter((l) => l.name.trim() !== "");

    if (filtered.length === 0) {
      return [...CSV_HEADERS].join(",") + "\n";
    }

    const rows = filtered.map((l) => ({
      Center_Name:   l.centerName,
      Website:       l.website,
      Source_Page:   l.sourcePage,
      Name:          l.name,
      Email:         l.email,
      LinkedIn_URL:  l.linkedinUrl,
      Title:         l.title,
      Organization:  l.org,
      Email_Status:  l.emailStatus,
      Source_Method: l.sourceMethod,
      Country:       l.country,
    }));

    return Papa.unparse(rows, {
      header: true,
      columns: [...CSV_HEADERS],
      newline: "\n",
    });
  } catch (err) {
    console.error(`exportCSV error: ${err instanceof Error ? err.message : String(err)}`);
    return [...CSV_HEADERS].join(",") + "\n";
  }
}

// ── 2. exportXLSX ──────────────────────────────────────────────────────────────

export async function exportXLSX(leads: OutputLead[]): Promise<Buffer> {
  try {
    const filtered = leads.filter((l) => l.name.trim() !== "");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Leads");

    worksheet.columns = XLSX_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: 15,
    }));

    // Header row: bold, dark navy bg, white text
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });

    // Freeze header row
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Data rows
    filtered.forEach((lead, idx) => {
      const rowNum = idx + 2;
      const isEven = rowNum % 2 === 0;

      const emailDisplay  = lead.emailStatus === "verified" ? `● ${lead.email}` : lead.email;
      const sourceDisplay = lead.sourceMethod === "domain_search" ? "Domain Search" : "Name Search";

      const row = worksheet.addRow({
        centerName:   lead.centerName,
        website:      lead.website,
        sourcePage:   lead.sourcePage,
        name:         lead.name,
        email:        emailDisplay,
        linkedinUrl:  lead.linkedinUrl,
        title:        lead.title,
        organization: lead.org,
        emailStatus:  lead.emailStatus,
        sourceMethod: sourceDisplay,
        country:      lead.country,
      });

      if (isEven) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F9" } };
        });
      }

      if (lead.linkedinUrl) {
        const cell = row.getCell("linkedinUrl");
        cell.value = { text: lead.linkedinUrl, hyperlink: lead.linkedinUrl };
        cell.font  = { color: { argb: "FF0563C1" }, underline: true };
      }
    });

    // Auto-fit column widths: measure every cell, clamp to [15, 60]
    worksheet.columns.forEach((col) => {
      if (!col || !col.eachCell) return;
      let maxLen = (col.header?.toString() ?? "").length;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        let len = 0;
        if (typeof v === "string") {
          len = v.length;
        } else if (v !== null && typeof v === "object" && "text" in (v as object)) {
          len = ((v as { text: string }).text ?? "").length;
        } else if (v != null) {
          len = String(v).length;
        }
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(Math.max(maxLen + 2, 15), 60);
    });

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
  } catch (err) {
    throw new Error(`exportXLSX failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── 3. exportSummary ───────────────────────────────────────────────────────────

export function exportSummary(
  leads: OutputLead[],
  skippedCenters: SkippedCenter[]
): string {
  const filtered        = leads.filter((l) => l.name.trim() !== "");
  const verifiedCount   = filtered.filter((l) => l.emailStatus === "verified").length;
  const linkedinOnly    = filtered.filter((l) => !l.email && l.linkedinUrl).length;
  const nameSearchCount = filtered.filter((l) => l.sourceMethod === "name_search").length;

  const SEP   = "=".repeat(40);
  const DASH  = "-".repeat(40);
  const SW    = 26;
  const SKW   = 34;

  const skipCounts = new Map<string, number>();
  for (const c of skippedCenters) {
    const cat = getSkipCategory(c.skipReason);
    skipCounts.set(cat, (skipCounts.get(cat) ?? 0) + 1);
  }

  const lines: string[] = [
    SEP,
    "PIPELINE EXPORT SUMMARY",
    SEP,
    `${"Total leads exported:".padEnd(SW)}${filtered.length}`,
    `${"With verified email:".padEnd(SW)}${verifiedCount}`,
    `${"LinkedIn only (no email):".padEnd(SW)}${linkedinOnly}`,
    `${"Name search leads:".padEnd(SW)}${nameSearchCount}  (lower confidence)`,
    DASH,
    `SKIPPED CENTERS: ${skippedCenters.length}`,
  ];

  for (const label of SKIP_DISPLAY_ORDER) {
    const count = skipCounts.get(label) ?? 0;
    if (count > 0) {
      lines.push(`${ `  ${label}:`.padEnd(SKW)}${count}`);
    }
  }

  lines.push(SEP);
  return lines.join("\n");
}

// ── 4. buildFilename ───────────────────────────────────────────────────────────

export function buildFilename(batchLabel: string, ext: "csv" | "xlsx"): string {
  const sanitized = batchLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const dateStr = dateFmt(new Date(), "MMddyyyy");

  return `rehab_leads_${sanitized}_${dateStr}.${ext}`;
}
