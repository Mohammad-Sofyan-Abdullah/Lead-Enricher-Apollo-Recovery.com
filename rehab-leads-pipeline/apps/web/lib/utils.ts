// How many centers one enrichment request takes on. The gateway drops any
// response that goes quiet for ~30s, and measured throughput is ~70ms per
// center, so 150 lands near 10s — roughly three times the headroom needed.
// Larger batches are worked through by calling the endpoint repeatedly.
export const ENRICH_CHUNK_SIZE = 150;

export function cn(...classes: (string | undefined | false | null | 0)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + "…";
}
