// ── Raw / input shapes ────────────────────────────────────────────────────────

export type RawCenter = {
  name: string;
  website: string; // may be empty, "N/A", or a listing URL
  sourcePage: string; // recovery.com / rehabpath URL — preserved as-is
};

// ── After cleaning ────────────────────────────────────────────────────────────

export type CleanedCenter = {
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
};

// ── Apollo search result (before enrichment) ──────────────────────────────────

export type SearchResult = {
  apolloId: string;
  domain: string;
  firstName: string;
  lastNameMasked: string;
  title: string;
  org: string;
  hasEmail: boolean;
  sourceMethod: "domain_search" | "name_search";
};

// ── Apollo enriched lead (after bulk_match) ───────────────────────────────────

export type EnrichedLead = {
  apolloId: string;
  fullName: string;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  title: string;
  org: string;
  country: string;
  sourceMethod: "domain_search" | "name_search";
};

// ── Export shape (for CSV / XLSX output) ──────────────────────────────────────

export type OutputLead = {
  centerName: string;
  website: string;
  sourcePage: string;
  name: string;
  email: string;
  linkedinUrl: string;
  title: string;
  org: string;
  emailStatus: string;
  sourceMethod: "domain_search" | "name_search";
  country: string;
};

// ── Skipped center (for export summary) ──────────────────────────────────────

export type SkippedCenter = {
  name: string;
  skipReason: string;
  sourcePage: string;
};

// ── Supabase row shapes (camelCase) ───────────────────────────────────────────

export type Center = {
  id: string;
  name: string;
  website: string | null;
  sourcePage: string | null;
  rawUrl: string | null;
  domain: string | null;
  noWebsite: boolean;
  sourceMethod: "domain_search" | "name_search";
  status: "pending" | "enriched" | "not_found" | "skipped";
  skipReason: string | null;
  batchId: string;
  createdAt: string;
  updatedAt: string;
};

export type Lead = {
  id: string;
  apolloId: string;
  centerId: string;
  centerName: string;
  website: string | null;
  sourcePage: string | null;
  fullName: string;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  title: string;
  organization: string;
  country: string;
  sourceMethod: "domain_search" | "name_search";
  createdAt: string;
  updatedAt: string;
};

export type Batch = {
  id: string;
  label: string;
  totalCenters: number;
  enriched: number;
  notFound: number;
  skipped: number;
  discarded: number;
  createdAt: string;
  updatedAt: string;
};

// ── Aggregated stats ──────────────────────────────────────────────────────────

export type BatchStats = {
  enriched: number;
  notFound: number;
  skipped: number;
  discarded: number;
  total: number;
};

// ── API response shapes ───────────────────────────────────────────────────────

export type EnrichResult = {
  batchId: string;
  enriched: number;
  notFound: number;
  skipped: number;
  discarded: number;
  duplicates: number;
};

export type BatchCreateSummary = {
  batchId: string;
  summary: {
    total: number;
    valid: number;
    skipped: number;
    noWebsite: number;
    skipReasons: Record<string, number>;
  };
  centers: CleanedCenter[];
};
