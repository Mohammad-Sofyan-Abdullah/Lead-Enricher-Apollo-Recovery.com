import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  exportCSV,
  exportXLSX,
  exportSummary,
  buildFilename,
  type OutputLead,
  type SkippedCenter,
} from "../src/index";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const baseLead: OutputLead = {
  centerName:  "Sunrise Recovery",
  website:     "https://sunriserecovery.com",
  sourcePage:  "https://recovery.com/sunrise",
  name:        "Jane Smith",
  email:       "jane@sunriserecovery.com",
  linkedinUrl: "https://linkedin.com/in/janesmith",
  title:       "CEO",
  org:         "Sunrise Recovery",
  country:     "United States",
  sourceMethod:"domain_search",
  emailStatus: "verified",
};

// ── exportCSV ──────────────────────────────────────────────────────────────────

describe("exportCSV", () => {
  it("empty leads array → header row only", () => {
    const result = exportCSV([]);
    const lines  = result.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "Center_Name,Website,Source_Page,Name,Email,LinkedIn_URL,Title,Organization,Email_Status,Source_Method,Country"
    );
  });

  it("lead with empty email → cell is empty string, not 'null'", () => {
    const lead = { ...baseLead, email: "" };
    const csv  = exportCSV([lead]);
    expect(csv).not.toContain("null");
    expect(csv).not.toContain("undefined");
    // email field should be an empty field between commas
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toBeTruthy();
  });

  it("center name with comma → field is quoted", () => {
    const lead = { ...baseLead, centerName: "Recovery, Inc." };
    const csv  = exportCSV([lead]);
    expect(csv).toContain('"Recovery, Inc."');
  });

  it("lead with empty name → filtered out", () => {
    const leads = [baseLead, { ...baseLead, name: "" }];
    const csv   = exportCSV(leads);
    const lines = csv.split("\n").filter(Boolean);
    // 1 header + 1 valid row (empty-name row dropped)
    expect(lines).toHaveLength(2);
  });

  it("columns appear in the correct order", () => {
    const csv     = exportCSV([baseLead]);
    const header  = csv.split("\n")[0];
    const expected =
      "Center_Name,Website,Source_Page,Name,Email,LinkedIn_URL,Title,Organization,Email_Status,Source_Method,Country";
    expect(header).toBe(expected);
  });
});

// ── exportXLSX ─────────────────────────────────────────────────────────────────

describe("exportXLSX", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await exportXLSX([baseLead]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("sheet is named 'Leads'", async () => {
    const buf  = await exportXLSX([baseLead]);
    const wb   = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.getWorksheet("Leads")).toBeTruthy();
  });

  it("lead with empty name is filtered out", async () => {
    const leads = [baseLead, { ...baseLead, name: "" }];
    const buf   = await exportXLSX(leads);
    const wb    = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Leads")!;
    // Row 1 = header, row 2 = baseLead — empty-name row should be absent
    expect(ws.rowCount).toBe(2);
  });

  it("empty leads → buffer still valid (header only)", async () => {
    const buf = await exportXLSX([]);
    const wb  = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Leads")!;
    expect(ws.rowCount).toBe(1); // header row only
  });
});

// ── exportSummary ──────────────────────────────────────────────────────────────

describe("exportSummary", () => {
  it("counts verified emails correctly", () => {
    const leads: OutputLead[] = [
      { ...baseLead, emailStatus: "verified" },
      { ...baseLead, name: "Bob Jones", emailStatus: "unverified" },
      { ...baseLead, name: "Carol Lee", emailStatus: "verified" },
    ];
    const summary = exportSummary(leads, []);
    expect(summary).toMatch(/With verified email:\s+2/);
  });

  it("counts total leads exported correctly", () => {
    const leads = [baseLead, { ...baseLead, name: "Bob Jones" }];
    const summary = exportSummary(leads, []);
    expect(summary).toMatch(/Total leads exported:\s+2/);
  });

  it("name search leads count is correct", () => {
    const leads: OutputLead[] = [
      { ...baseLead, sourceMethod: "name_search" },
      { ...baseLead, name: "Bob Jones", sourceMethod: "domain_search" },
    ];
    const summary = exportSummary(leads, []);
    expect(summary).toContain("Name search leads:");
    expect(summary).toContain("1  (lower confidence)");
  });

  it("counts skipped centers by reason correctly", () => {
    const skipped: SkippedCenter[] = [
      { name: "A", skipReason: "iubenda placeholder — no real website" },
      { name: "B", skipReason: "iubenda placeholder — no real website" },
      { name: "C", skipReason: "international TLD — outside USA" },
    ];
    const summary = exportSummary([], skipped);
    expect(summary).toContain("SKIPPED CENTERS: 3");
    expect(summary).toContain("iubenda placeholder:");
    expect(summary).toContain("International TLD:");
    // categories with 0 entries should not appear
    expect(summary).not.toContain("ctcprograms.com:");
  });

  it("skipped categories with 0 count are not shown", () => {
    const summary = exportSummary([], [
      { name: "X", skipReason: "invalid_url" },
    ]);
    expect(summary).toContain("Invalid URL:");
    expect(summary).not.toContain("iubenda placeholder:");
    expect(summary).not.toContain("International TLD:");
  });

  it("leads with empty name are excluded from counts", () => {
    const leads = [baseLead, { ...baseLead, name: "" }];
    const summary = exportSummary(leads, []);
    expect(summary).toMatch(/Total leads exported:\s+1/);
  });
});

// ── buildFilename ──────────────────────────────────────────────────────────────

describe("buildFilename", () => {
  it("spaces in label are replaced with underscores", () => {
    const name = buildFilename("aware benchmark", "csv");
    expect(name).toMatch(/^rehab_leads_aware_benchmark_\d{8}\.csv$/);
  });

  it("special characters are stripped from label", () => {
    const name = buildFilename("Recovery.com - Q2 #1!", "xlsx");
    expect(name).toMatch(/^rehab_leads_recovery_com_q2_1_\d{8}\.xlsx$/);
  });

  it("date part is in MMDDYYYY format (8 digits)", () => {
    const name = buildFilename("test", "csv");
    expect(name).toMatch(/rehab_leads_test_\d{8}\.csv/);
    const datePart = name.match(/(\d{8})/)?.[1]!;
    expect(datePart).toHaveLength(8);
  });

  it("returns .csv extension for csv format", () => {
    expect(buildFilename("test", "csv")).toMatch(/\.csv$/);
  });

  it("returns .xlsx extension for xlsx format", () => {
    expect(buildFilename("test", "xlsx")).toMatch(/\.xlsx$/);
  });

  it("leading and trailing underscores from label are stripped", () => {
    const name = buildFilename("  --test--  ", "csv");
    expect(name).toMatch(/^rehab_leads_test_\d{8}\.csv$/);
  });
});
