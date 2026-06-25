import { describe, it, expect } from "vitest";
import { detectFileType, parseCSVText, buildCentersFromMapping } from "../lib/csvImport";

// ── parseCSVText ──────────────────────────────────────────────────────────────

describe("parseCSVText", () => {
  it("parses standard column names correctly", () => {
    const csv = [
      "Center Name,Website URL,Source Page",
      "Sunrise Recovery,https://sunriserecovery.com,https://recovery.com/page1",
      "Hope Center,https://hopecenter.org,https://recovery.com/page2",
    ].join("\n");

    const result = parseCSVText(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.centers).toHaveLength(2);
    expect(result.centers[0]).toEqual({
      name: "Sunrise Recovery",
      website: "https://sunriserecovery.com",
      sourcePage: "https://recovery.com/page1",
    });
    expect(result.totalRows).toBe(2);
    expect(result.skippedRows).toBe(0);
  });

  it("matches column names via aliases (name, url, source)", () => {
    const csv = [
      "name,url,source",
      "Alpha Rehab,https://alpharehab.com,https://rehabpath.com/alpha",
    ].join("\n");

    const result = parseCSVText(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.centers).toHaveLength(1);
    expect(result.centers[0].name).toBe("Alpha Rehab");
    expect(result.centers[0].website).toBe("https://alpharehab.com");
    expect(result.detectedColumns.name).toBe("name");
    expect(result.detectedColumns.website).toBe("url");
    expect(result.detectedColumns.sourcePage).toBe("source");
  });

  it("matches center_name, website_url, source_page aliases", () => {
    const csv = [
      "center_name,website_url,source_page",
      "Beta Center,https://betacenter.com,",
    ].join("\n");

    const result = parseCSVText(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.centers[0].name).toBe("Beta Center");
    expect(result.detectedColumns.name).toBe("center_name");
  });

  it("returns error when Center Name column is missing", () => {
    const csv = ["website,source", "https://example.com,https://source.com"].join(
      "\n"
    );

    const result = parseCSVText(csv);

    expect(result.errors).toContain("CSV must have a Center Name column");
    expect(result.centers).toHaveLength(0);
  });

  it("returns warning when Website URL column is missing", () => {
    const csv = ["Center Name,Source Page", "Sunrise Recovery,https://source.com"].join(
      "\n"
    );

    const result = parseCSVText(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toContain(
      "No Website URL column found — all centers will use name search"
    );
    expect(result.centers[0].website).toBe("");
  });

  it("skips rows with empty Center Name and counts them", () => {
    const csv = [
      "Center Name,Website URL",
      "Good Center,https://good.com",
      ",https://noname.com",
      "   ,https://whitespace.com",
      "Another Center,https://another.com",
    ].join("\n");

    const result = parseCSVText(csv);

    expect(result.centers).toHaveLength(2);
    expect(result.skippedRows).toBe(2);
    expect(result.totalRows).toBe(4);
  });

  it("handles quoted fields with embedded commas", () => {
    const csv = [
      'Center Name,Website URL,Source Page',
      '"Recovery Center, LLC",https://rclc.com,https://source.com',
    ].join("\n");

    const result = parseCSVText(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.centers[0].name).toBe("Recovery Center, LLC");
  });

  it("exposes rawRows and headers for downstream remapping", () => {
    const csv = ["name,url", "Alpha,https://alpha.com"].join("\n");
    const result = parseCSVText(csv);

    expect(result.headers).toEqual(["name", "url"]);
    expect(result.rawRows).toHaveLength(1);
    expect(result.rawRows[0]).toHaveProperty("name", "Alpha");
  });

  it("handles a large CSV (100+ rows) without error", () => {
    const rows = Array.from(
      { length: 120 },
      (_, i) => `Center ${i + 1},https://center${i + 1}.com,https://source.com`
    );
    const csv = ["Center Name,Website URL,Source Page", ...rows].join("\n");

    const result = parseCSVText(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.centers).toHaveLength(120);
    expect(result.totalRows).toBe(120);
  });
});

// ── buildCentersFromMapping ───────────────────────────────────────────────────

describe("buildCentersFromMapping", () => {
  const rows = [
    { facility: "Sunrise Recovery", web: "https://sunrise.com", pg: "https://source.com" },
    { facility: "Hope Center", web: "https://hope.org", pg: "" },
    { facility: "", web: "https://noname.com", pg: "" },
  ];

  it("builds centers using a custom column mapping", () => {
    const result = buildCentersFromMapping(rows, {
      name: "facility",
      website: "web",
      sourcePage: "pg",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.centers).toHaveLength(2);
    expect(result.centers[0].name).toBe("Sunrise Recovery");
    expect(result.centers[0].website).toBe("https://sunrise.com");
    expect(result.skippedRows).toBe(1);
  });

  it("returns error when name mapping is null", () => {
    const result = buildCentersFromMapping(rows, {
      name: null,
      website: "web",
      sourcePage: "pg",
    });

    expect(result.errors).toContain("CSV must have a Center Name column");
    expect(result.centers).toHaveLength(0);
    expect(result.skippedRows).toBe(rows.length);
  });

  it("returns warning when website mapping is null", () => {
    const result = buildCentersFromMapping(rows, {
      name: "facility",
      website: null,
      sourcePage: null,
    });

    expect(result.warnings).toContain(
      "No Website URL column found — all centers will use name search"
    );
    expect(result.centers[0].website).toBe("");
  });
});

// ── detectFileType ────────────────────────────────────────────────────────────

describe("detectFileType", () => {
  it("detects XLSX magic bytes (50 4B 03 04)", async () => {
    const data = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...new Array(100).fill(0x41),
    ]);
    const file = new File([data], "workbook.xlsx");
    expect(await detectFileType(file)).toBe("xlsx");
  });

  it("detects old XLS magic bytes (D0 CF 11 E0)", async () => {
    const data = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0,
      ...new Array(100).fill(0x41),
    ]);
    const file = new File([data], "workbook.xls");
    expect(await detectFileType(file)).toBe("xls");
  });

  it("detects binary files that contain null bytes", async () => {
    const data = new Uint8Array([0x41, 0x42, 0x00, 0x44]);
    const file = new File([data], "binary.bin");
    expect(await detectFileType(file)).toBe("binary");
  });

  it("returns csv for plain-text CSV content", async () => {
    const content = "Center Name,Website URL\nAlpha Recovery,https://alpha.com";
    const file = new File([content], "centers.csv", { type: "text/csv" });
    expect(await detectFileType(file)).toBe("csv");
  });

  it("detects CSV content even if file is named .xlsx", async () => {
    const content = "Center Name,Website URL\nAlpha Recovery,https://alpha.com";
    const file = new File([content], "centers.xlsx");
    expect(await detectFileType(file)).toBe("csv");
  });
});
