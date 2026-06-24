import { describe, it, expect } from "vitest";
import {
  cleanCenters,
  parseRawInput,
  getUniqueDomains,
  getNameSearchCenters,
} from "../src/index";

describe("cleanCenters", () => {
  it("strips UTM + tracking params and extracts domain", () => {
    const [r] = cleanCenters([
      {
        name: "Sunrise Recovery",
        website:
          "https://example.com/about?utm_source=google&utm_medium=cpc&ref=recovery&fbclid=abc",
        sourcePage: "https://recovery.com/test",
      },
    ]);
    expect(r.cleanUrl).toBe("https://example.com/about");
    expect(r.domain).toBe("example.com");
    expect(r.status).toBe("valid");
    expect(r.noWebsite).toBe(false);
    expect(r.sourceMethod).toBe("domain_search");
  });

  it("skips iubenda.com with the correct reason", () => {
    const [r] = cleanCenters([
      {
        name: "Test Center",
        website: "https://www.iubenda.com/privacy-policy/123456",
        sourcePage: "",
      },
    ]);
    expect(r.status).toBe("skipped");
    expect(r.skipReason).toBe("iubenda placeholder — no real website");
  });

  it("treats empty website as noWebsite=true with name_search", () => {
    const [r] = cleanCenters([
      {
        name: "Test Center",
        website: "",
        sourcePage: "https://recovery.com/test",
      },
    ]);
    expect(r.noWebsite).toBe(true);
    expect(r.sourceMethod).toBe("name_search");
    expect(r.status).toBe("valid");
    expect(r.domain).toBe("");
    expect(r.cleanUrl).toBe("");
  });

  it('treats "N/A" website as no website', () => {
    const [r] = cleanCenters([
      { name: "Test Center", website: "N/A", sourcePage: "" },
    ]);
    expect(r.noWebsite).toBe(true);
    expect(r.sourceMethod).toBe("name_search");
    expect(r.status).toBe("valid");
  });

  it("treats a recovery.com listing URL passed as website as no website", () => {
    const [r] = cleanCenters([
      {
        name: "Test Center",
        website: "https://recovery.com/rehab-centers/some-center",
        sourcePage: "https://recovery.com/rehab-centers/some-center",
      },
    ]);
    expect(r.noWebsite).toBe(true);
    expect(r.sourceMethod).toBe("name_search");
    expect(r.status).toBe("valid");
  });

  it("skips .com.au domains as international TLD", () => {
    const [r] = cleanCenters([
      {
        name: "Test",
        website: "https://example.com.au/about",
        sourcePage: "",
      },
    ]);
    expect(r.status).toBe("skipped");
    expect(r.skipReason).toBe("international TLD — outside USA");
  });

  it("marks the second center with same domain as SAME_DOMAIN (both remain valid)", () => {
    const [a, b] = cleanCenters([
      { name: "Center A", website: "https://example.com", sourcePage: "" },
      { name: "Center B", website: "https://example.com/contact", sourcePage: "" },
    ]);
    expect(a.note).toBeUndefined();
    expect(b.note).toBe("SAME_DOMAIN as 'Center A'");
    expect(b.status).toBe("valid");
  });

  it("collapses behavioralhealth.banyantreatmentcenter.com to root domain", () => {
    const [r] = cleanCenters([
      {
        name: "Banyan Boca",
        website:
          "https://behavioralhealth.banyantreatmentcenter.com/locations/boca",
        sourcePage: "",
      },
    ]);
    expect(r.domain).toBe("banyantreatmentcenter.com");
    expect(r.status).toBe("valid");
  });

  it("skips a malformed URL with reason invalid_url", () => {
    const [r] = cleanCenters([
      { name: "Test", website: "not-a-url", sourcePage: "" },
    ]);
    expect(r.status).toBe("skipped");
    expect(r.skipReason).toBe("invalid_url");
    expect(r.noWebsite).toBe(true);
  });
});

describe("parseRawInput", () => {
  it("parses a tab-separated row with 3 columns", () => {
    const result = parseRawInput(
      "Sunrise Recovery\thttps://sunriserecovery.com\thttps://recovery.com/sunrise"
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Sunrise Recovery",
      website: "https://sunriserecovery.com",
      sourcePage: "https://recovery.com/sunrise",
    });
  });

  it("discards a header row containing 'center name'", () => {
    const text = [
      "Center Name\tWebsite URL\tSource Page",
      "Sunrise Recovery\thttps://sunriserecovery.com\thttps://recovery.com/sunrise",
    ].join("\n");
    const result = parseRawInput(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sunrise Recovery");
  });

  it("discards a header row containing 'website' (case-insensitive)", () => {
    const text = [
      "Name\tWebsite\tSource",
      "Center One\thttps://centerone.com\t",
    ].join("\n");
    const result = parseRawInput(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Center One");
  });

  it("handles a 2-column row (no sourcePage)", () => {
    const result = parseRawInput("Center One\thttps://centerone.com");
    expect(result[0]).toEqual({
      name: "Center One",
      website: "https://centerone.com",
      sourcePage: "",
    });
  });

  it("handles a 1-column row (name only)", () => {
    const result = parseRawInput("Center One");
    expect(result[0]).toEqual({
      name: "Center One",
      website: "",
      sourcePage: "",
    });
  });

  it("skips blank lines", () => {
    const text = "Center A\thttps://a.com\t\n\n\nCenter B\thttps://b.com\t";
    expect(parseRawInput(text)).toHaveLength(2);
  });
});

describe("getUniqueDomains", () => {
  it("deduplicates domains from valid centers, excludes noWebsite and skipped", () => {
    const centers = cleanCenters([
      { name: "A", website: "https://example.com", sourcePage: "" },
      { name: "B", website: "https://example.com/other", sourcePage: "" }, // SAME_DOMAIN
      { name: "C", website: "https://another.com", sourcePage: "" },
      { name: "D", website: "", sourcePage: "" }, // noWebsite
      { name: "E", website: "https://iubenda.com", sourcePage: "" }, // skipped
    ]);
    expect(getUniqueDomains(centers)).toEqual(["example.com", "another.com"]);
  });
});

describe("getNameSearchCenters", () => {
  it("returns only valid centers with noWebsite=true", () => {
    const centers = cleanCenters([
      { name: "Has Website", website: "https://example.com", sourcePage: "" },
      { name: "No Website", website: "", sourcePage: "" },
      { name: "Skipped", website: "https://iubenda.com", sourcePage: "" },
    ]);
    const result = getNameSearchCenters(centers);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("No Website");
  });
});
