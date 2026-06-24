// ── Constants ─────────────────────────────────────────────────────────────────

const LISTING_DOMAINS = new Set([
  "recovery.com",
  "rehabpath.com",
  "luxuryrehab.com",
  "findrehabcenter.com",
  "samhsa.gov",
]);

const EMPTY_VALUES = new Set(["", "n/a", "none", "null", "-", "–"]);

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "sf_shortname", "_ga", "fbclid", "gclid", "msclkid", "ref", "source",
  "rehabpath", "recoverycom", "luxuryrehab",
];

// Sorted longest-first so multi-part TLDs (.com.au) are tested before shorter ones (.in)
const INTL_TLDS = [".com.au", ".org.uk", ".co.uk", ".co.nz", ".co.za", ".co.in", ".in"];

const KNOWN_INTL_DOMAINS = new Set([
  "rehabbali.com",
  "kasihkaruniabali.org",
  "bajaibogainecenter.com",
  "bajarehab.com",
  "basseibogaine.com",
  "bayberry.org.uk",
  "southpacificprivate.com.au",
  "bellevuesoberresidence.com",
  "edgewoodhealthnetwork.com",
  "nepalrehabcenter.com",
]);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RawCenter {
  name: string;
  website: string;
  sourcePage: string;
}

export interface CleanedCenter {
  name: string;
  cleanUrl: string;
  sourcePage: string;
  rawUrl: string;
  domain: string;
  status: "valid" | "skipped";
  skipReason?: string;
  noWebsite: boolean;
  sourceMethod: "domain_search" | "name_search";
  note?: string;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function isListingUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return LISTING_DOMAINS.has(hostname);
}

function stripTrackingParams(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return url;
  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }
  return parsed.toString();
}

function extractRootDomain(url: string): { domain: string; error?: string } {
  const parsed = parseUrl(url);
  if (!parsed) return { domain: "", error: "invalid_url" };

  let hostname = parsed.hostname.toLowerCase();

  // Must have at least one dot to be a real domain
  if (!hostname.includes(".")) return { domain: "", error: "invalid_url" };

  hostname = hostname.replace(/^www\./, "");

  // Named subdomain collapse — add others here as encountered
  if (hostname === "behavioralhealth.banyantreatmentcenter.com") {
    hostname = "banyantreatmentcenter.com";
  }

  return { domain: hostname };
}

function getSkipReason(domain: string): string | undefined {
  // Rule 1
  if (domain === "iubenda.com") {
    return "iubenda placeholder — no real website";
  }
  // Rule 2
  if (domain === "ctcprograms.com") {
    return "ctcprograms.com — MAT clinic chain, Apollo returns no usable results";
  }
  // Rule 3
  if (domain === "activehosted.com" || domain.endsWith(".activehosted.com")) {
    return "activehosted portal — not a center website";
  }
  // Rule 4
  if (INTL_TLDS.some((tld) => domain.endsWith(tld))) {
    return "international TLD — outside USA";
  }
  // Rule 5
  if (KNOWN_INTL_DOMAINS.has(domain)) {
    return "international center — outside USA";
  }
  // Rule 6
  if (domain.endsWith(".gov")) {
    return "government or county site — not searchable in Apollo";
  }
  // Rule 7
  if (
    domain === "samhsa.gov" ||
    domain === "findtreatment.gov" ||
    domain === "psychology.com"
  ) {
    return "directory or government portal — not a center website";
  }
  return undefined;
}

function noWebsiteResult(
  name: string,
  website: string,
  sourcePage: string
): CleanedCenter {
  return {
    name,
    cleanUrl: "",
    sourcePage,
    rawUrl: website,
    domain: "",
    status: "valid",
    noWebsite: true,
    sourceMethod: "name_search",
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function cleanCenters(raw: RawCenter[]): CleanedCenter[] {
  const seenDomains = new Map<string, string>(); // domain → first center name

  return raw.map((row) => {
    const name = (row.name ?? "").trim();
    const website = (row.website ?? "").trim();
    const sourcePage = (row.sourcePage ?? "").trim();

    // ── Step 1: empty / placeholder / listing URL ─────────────────────────────
    if (EMPTY_VALUES.has(website.toLowerCase()) || isListingUrl(website)) {
      return noWebsiteResult(name, website, sourcePage);
    }

    // ── Step 2: strip tracking params ────────────────────────────────────────
    const cleanUrl = stripTrackingParams(website);

    // ── Step 3: extract root domain ───────────────────────────────────────────
    const { domain, error } = extractRootDomain(cleanUrl);
    if (error) {
      return {
        name,
        cleanUrl,
        sourcePage,
        rawUrl: website,
        domain: "",
        status: "skipped",
        skipReason: "invalid_url",
        noWebsite: true,
        sourceMethod: "name_search",
      };
    }

    // ── Step 4: skip rules ────────────────────────────────────────────────────
    const skipReason = getSkipReason(domain);
    if (skipReason) {
      return {
        name,
        cleanUrl,
        sourcePage,
        rawUrl: website,
        domain,
        status: "skipped",
        skipReason,
        noWebsite: false,
        sourceMethod: "domain_search",
      };
    }

    // ── Step 5: same-domain note ──────────────────────────────────────────────
    let note: string | undefined;
    if (seenDomains.has(domain)) {
      note = `SAME_DOMAIN as '${seenDomains.get(domain)}'`;
    } else {
      seenDomains.set(domain, name);
    }

    return {
      name,
      cleanUrl,
      sourcePage,
      rawUrl: website,
      domain,
      status: "valid",
      noWebsite: false,
      sourceMethod: "domain_search",
      ...(note !== undefined ? { note } : {}),
    };
  });
}

/**
 * Deduplicated domains from valid (non-skipped) centers that have a website.
 * Feed directly into Apollo searchByDomains().
 */
export function getUniqueDomains(centers: CleanedCenter[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of centers) {
    if (c.status === "valid" && c.domain && !seen.has(c.domain)) {
      seen.add(c.domain);
      result.push(c.domain);
    }
  }
  return result;
}

/**
 * Valid centers with no extractable website — these go through Apollo name search.
 */
export function getNameSearchCenters(centers: CleanedCenter[]): CleanedCenter[] {
  return centers.filter((c) => c.status === "valid" && c.noWebsite);
}

/**
 * Parses a raw tab-separated paste from the UI textarea.
 * Columns: Center Name [TAB] Website URL [TAB] Source Page URL
 * Automatically discards a header row if the first non-empty line
 * contains "center name" or "website" (case-insensitive).
 */
export function parseRawInput(text: string): RawCenter[] {
  const lines = text.split("\n");
  const results: RawCenter[] = [];
  let firstNonEmpty = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (firstNonEmpty) {
      firstNonEmpty = false;
      const lower = trimmed.toLowerCase();
      if (lower.includes("center name") || lower.includes("website")) {
        continue; // discard header
      }
    }

    const cols = trimmed.split("\t").map((c) => c.trim());

    if (cols.length >= 3) {
      results.push({ name: cols[0], website: cols[1], sourcePage: cols[2] });
    } else if (cols.length === 2) {
      results.push({ name: cols[0], website: cols[1], sourcePage: "" });
    } else if (cols.length === 1 && cols[0]) {
      results.push({ name: cols[0], website: "", sourcePage: "" });
    }
  }

  return results;
}
