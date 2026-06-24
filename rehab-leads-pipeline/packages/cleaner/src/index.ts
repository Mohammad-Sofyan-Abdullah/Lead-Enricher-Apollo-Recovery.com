export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  // Ensure scheme exists so URL parses correctly
  const withScheme = /^https?:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    // Strip www. prefix for canonical domain comparison
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "");
  }
}

export function extractDomain(raw: string): string {
  return normalizeUrl(raw);
}

/**
 * Deduplicates an array of raw URLs by resolved domain.
 * Returns the first-seen URL for each domain, along with the canonical domain.
 */
export function dedupeByDomain(
  urls: string[]
): Array<{ raw: string; domain: string }> {
  const seen = new Set<string>();
  const results: Array<{ raw: string; domain: string }> = [];

  for (const raw of urls) {
    if (!raw || !raw.trim()) continue;
    const domain = extractDomain(raw);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    results.push({ raw, domain });
  }

  return results;
}

export function isSkippableUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const skippedHosts = [
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "yelp.com",
    "healthgrades.com",
    "psychology-today.com",
    "psychologytoday.com",
    "findtreatment.gov",
    "samhsa.gov",
    "linkedin.com",
  ];
  return skippedHosts.some((h) => lower.includes(h));
}

export function classifyUrl(raw: string): {
  domain: string;
  skip: boolean;
  skipReason?: string;
} {
  if (!raw || !raw.trim()) {
    return { domain: "", skip: true, skipReason: "empty" };
  }
  if (isSkippableUrl(raw)) {
    const domain = extractDomain(raw);
    return { domain, skip: true, skipReason: "social_or_directory" };
  }
  return { domain: extractDomain(raw), skip: false };
}
