// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.apollo.io/v1";

const SEARCH_FILTERS = {
  person_seniorities: ["owner", "c_suite", "vp", "director"],
  person_titles: [
    "owner",
    "ceo",
    "chief executive officer",
    "executive director",
    "president",
    "founder",
    "chief operating officer",
    "managing director",
    "administrator",
  ],
  person_locations: ["United States"],
  per_page: 25,
  page: 1,
} as const;

// Ordered most-specific → least-specific to prevent substring false-matches
// e.g. "vice president" must be checked before "president"
const TITLE_RANK_ORDERED: Array<[string, number]> = [
  ["founding ceo", 1],
  ["co-ceo", 1],
  ["group ceo", 1],
  ["interim ceo", 1],
  ["chief executive officer", 1],
  ["ceo", 1],
  ["vice president", 9],
  ["president", 2],
  ["co-founder", 3],
  ["founder", 3],
  ["co-owner", 4],
  ["owner", 4],
  ["executive director", 5],
  ["chief operating officer", 6],
  ["coo", 6],
  ["managing director", 7],
  ["administrator", 8],
  ["vp", 9],
  ["director", 10],
];

const DOMAIN_BATCH_SIZE = 13;
const ENRICH_BATCH_SIZE = 10;
const RATE_LIMIT_MS = 500;
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;

// ── Types ────────────────────────────────────────────────────────────────────

// Structural minimum required by processCenters — satisfied by @rehab-leads/cleaner CleanedCenter
export interface CleanedCenter {
  name: string;
  domain: string; // empty string when no website
}

export interface SearchResult {
  apolloId: string;
  domain: string;
  firstName: string;
  lastNameMasked: string;
  title: string;
  org: string;
  hasEmail: boolean;
  sourceMethod: "domain_search" | "name_search";
}

export interface EnrichedLead {
  apolloId: string;
  fullName: string;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  title: string;
  org: string;
  country: string;
  sourceMethod: "domain_search" | "name_search";
}

// ── Apollo wire types ────────────────────────────────────────────────────────

interface ApolloOrg {
  name?: string | null;
  primary_domain?: string | null;
  website_url?: string | null;
}

interface ApolloPerson {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  country?: string | null;
  organization?: ApolloOrg | null;
  organization_name?: string | null;
}

interface ApolloSearchResponse {
  people?: ApolloPerson[];
}

interface ApolloBulkMatchResponse {
  matches?: ApolloPerson[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rankTitle(title: string | null | undefined): number {
  if (!title) return 99;
  const lower = title.toLowerCase().trim();
  for (const [key, rank] of TITLE_RANK_ORDERED) {
    if (lower === key || lower.includes(key)) return rank;
  }
  return 99;
}

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY env var is not set");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, options);
      // Don't retry on 4xx — those are client errors
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
    } catch (err) {
      lastError = err;
    }
    await sleep(RETRY_BACKOFF_MS);
  }
  throw lastError ?? new Error(`Request failed after ${RETRY_ATTEMPTS} attempts`);
}

function extractOrgDomain(org: ApolloOrg | null | undefined): string {
  if (!org) return "";
  if (org.primary_domain) return org.primary_domain;
  if (org.website_url) {
    try {
      return new URL(org.website_url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  return "";
}

function toSearchResult(
  person: ApolloPerson,
  domain: string,
  sourceMethod: "domain_search" | "name_search"
): SearchResult {
  const emailStatus = (person.email_status ?? "").toLowerCase();
  return {
    apolloId: person.id,
    domain,
    firstName: person.first_name ?? "",
    lastNameMasked: person.last_name ?? "",
    title: person.title ?? "",
    org:
      person.organization?.name ??
      person.organization_name ??
      "",
    hasEmail:
      !!person.email &&
      (emailStatus === "verified" || emailStatus === "likely to engage"),
    sourceMethod,
  };
}

function pickBestPerDomain(
  people: ApolloPerson[],
  sourceMethod: "domain_search" | "name_search"
): SearchResult[] {
  const best = new Map<string, ApolloPerson>();

  for (const person of people) {
    const domain = extractOrgDomain(person.organization);
    if (!domain) continue;

    const current = best.get(domain);
    if (!current || rankTitle(person.title) < rankTitle(current.title)) {
      best.set(domain, person);
    }
  }

  return Array.from(best.entries()).map(([domain, person]) =>
    toSearchResult(person, domain, sourceMethod)
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Searches Apollo for decision-makers at the given org domains.
 * Batches into groups of 13. Picks ONE best-ranked lead per domain.
 */
export async function searchByDomains(
  domains: string[]
): Promise<SearchResult[]> {
  const apiKey = getApiKey();
  const results: SearchResult[] = [];

  for (let i = 0; i < domains.length; i += DOMAIN_BATCH_SIZE) {
    const batch = domains.slice(i, i + DOMAIN_BATCH_SIZE);

    const res = await fetchWithRetry(`${BASE_URL}/mixed_people/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        api_key: apiKey,
        ...SEARCH_FILTERS,
        q_organization_domains_list: batch,
      }),
    });

    if (!res.ok) {
      console.error(
        `Apollo domain search error ${res.status} (batch ${Math.floor(i / DOMAIN_BATCH_SIZE) + 1})`
      );
    } else {
      const json = (await res.json()) as ApolloSearchResponse;
      results.push(...pickBestPerDomain(json.people ?? [], "domain_search"));
    }

    if (i + DOMAIN_BATCH_SIZE < domains.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return results;
}

/**
 * Fallback for centers with no website URL.
 * Searches by org name keyword; discards results whose org name doesn't
 * loosely match the center name (substring check in either direction).
 */
export async function searchByName(
  centerName: string
): Promise<SearchResult | null> {
  const apiKey = getApiKey();

  const res = await fetchWithRetry(`${BASE_URL}/mixed_people/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify({
      api_key: apiKey,
      ...SEARCH_FILTERS,
      q_keywords: centerName,
    }),
  });

  if (!res.ok) return null;

  const json = (await res.json()) as ApolloSearchResponse;
  const needle = centerName.toLowerCase();

  const matched = (json.people ?? []).filter((p) => {
    const orgName = (
      p.organization?.name ??
      p.organization_name ??
      ""
    ).toLowerCase();
    return orgName.includes(needle) || needle.includes(orgName);
  });

  if (!matched.length) return null;

  const best = matched.reduce((a, b) =>
    rankTitle(a.title) <= rankTitle(b.title) ? a : b
  );

  return toSearchResult(best, "", "name_search");
}

/**
 * Splits centers into domain vs. name-only groups, runs both search paths,
 * and returns the merged SearchResult array ready for enrichBulk.
 */
export async function processCenters(
  centers: CleanedCenter[]
): Promise<SearchResult[]> {
  const hasDomain = centers.filter((c) => c.domain.trim() !== "");
  const noDomain = centers.filter((c) => c.domain.trim() === "");

  const results: SearchResult[] = [];

  if (hasDomain.length > 0) {
    // Deduplicate domains before sending — searchByDomains handles batching internally
    const uniqueDomains = [...new Set(hasDomain.map((c) => c.domain))];
    const found = await searchByDomains(uniqueDomains);
    results.push(...found);
  }

  for (const center of noDomain) {
    const found = await searchByName(center.name);
    if (found) results.push(found);
    await sleep(RATE_LIMIT_MS);
  }

  return results;
}

/**
 * Enriches a list of SearchResults via Apollo bulk_match.
 * Batches into groups of 10. Hard-filters out non-US leads.
 */
export async function enrichBulk(
  leads: SearchResult[]
): Promise<EnrichedLead[]> {
  const apiKey = getApiKey();
  const enriched: EnrichedLead[] = [];

  for (let i = 0; i < leads.length; i += ENRICH_BATCH_SIZE) {
    const batch = leads.slice(i, i + ENRICH_BATCH_SIZE);
    const sourceById = new Map(batch.map((l) => [l.apolloId, l]));

    const res = await fetchWithRetry(`${BASE_URL}/people/bulk_match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        api_key: apiKey,
        details: batch.map((l) => ({ id: l.apolloId })),
      }),
    });

    if (!res.ok) {
      console.error(
        `Apollo bulk_match error ${res.status} (batch ${Math.floor(i / ENRICH_BATCH_SIZE) + 1})`
      );
    } else {
      const json = (await res.json()) as ApolloBulkMatchResponse;

      for (const person of json.matches ?? []) {
        const source = sourceById.get(person.id);
        if (!source) continue;

        const country = person.country ?? null;

        // Hard USA filter — null country is also discarded
        if (!country || country.toLowerCase() !== "united states") {
          console.log(
            `Discarded ${person.first_name ?? ""} ${person.last_name ?? ""} — country: ${country ?? "null"}`
          );
          continue;
        }

        enriched.push({
          apolloId: person.id,
          fullName: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
          email: person.email ?? null,
          emailStatus: person.email_status ?? "",
          linkedinUrl: person.linkedin_url ?? null,
          title: person.title ?? source.title,
          org:
            person.organization?.name ??
            person.organization_name ??
            source.org,
          country,
          sourceMethod: source.sourceMethod,
        });
      }
    }

    if (i + ENRICH_BATCH_SIZE < leads.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return enriched;
}
