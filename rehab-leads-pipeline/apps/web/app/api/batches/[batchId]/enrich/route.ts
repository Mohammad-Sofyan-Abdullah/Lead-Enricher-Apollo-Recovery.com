import { NextRequest, NextResponse } from "next/server";
import { searchByDomains, searchByNames, enrichBulk } from "@rehab-leads/apollo";
import type { SearchResult, EnrichedLead } from "@pipeline/types";
import type { Center } from "@pipeline/types";
import {
  getPendingCentersByBatch,
  saveLeadsBulk,
  updateCenterStatuses,
  updateBatchStats,
  getBatchStats,
} from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const { batchId } = params;

  if (!batchId?.trim()) {
    return NextResponse.json(
      { error: "Validation error", detail: "batchId is required" },
      { status: 400 }
    );
  }

  const startedAt = Date.now();

  try {
    // 1. Load all pending centers for this batch
    const pendingCenters = await getPendingCentersByBatch(batchId);

    if (!pendingCenters.length) {
      return NextResponse.json(
        { error: "Not found", detail: "No pending centers found for this batch" },
        { status: 404 }
      );
    }

    // 2. Split into domain-search vs name-search centers
    const domainCenters = pendingCenters.filter((c) => !c.noWebsite && c.domain);
    const nameCenters = pendingCenters.filter((c) => c.noWebsite);

    // 3. Build apolloId → Center[] mapping during the search phase
    //    so enriched leads can be matched back to their source centers.
    const apolloIdToCenters = new Map<string, Center[]>();
    const allSearchResults: SearchResult[] = [];

    // Domain search — deduplicate domains, batched and run concurrently inside
    const uniqueDomains = [...new Set(
      domainCenters.map((c) => c.domain as string)
    )];

    if (uniqueDomains.length > 0) {
      const domainResults = await searchByDomains(uniqueDomains);
      for (const result of domainResults) {
        const matching = domainCenters.filter((c) => c.domain === result.domain);
        const existing = apolloIdToCenters.get(result.apolloId) ?? [];
        apolloIdToCenters.set(result.apolloId, [...existing, ...matching]);
        allSearchResults.push(result);
      }
    }

    // Name search — run concurrently, results align with nameCenters by index
    if (nameCenters.length > 0) {
      const nameResults = await searchByNames(nameCenters.map((c) => c.name));

      for (let i = 0; i < nameCenters.length; i++) {
        const result = nameResults[i];
        if (!result) continue;

        const existing = apolloIdToCenters.get(result.apolloId) ?? [];
        apolloIdToCenters.set(result.apolloId, [...existing, nameCenters[i]]);

        // Guard against duplicate SearchResult entries
        if (!allSearchResults.some((r) => r.apolloId === result.apolloId)) {
          allSearchResults.push(result);
        }
      }
    }

    // 4. Enrich all search results (bulk_match, batched in 10s, US filter applied inside)
    const enrichedLeads = await enrichBulk(allSearchResults);

    // 5. Flatten to (lead, center) pairs in the same order the sequential
    //    version processed them, so "first apollo_id wins" dedup is unchanged.
    const pairs: { lead: EnrichedLead; center: Center }[] = [];
    let discardedCount = 0;

    for (const lead of enrichedLeads) {
      // Safety net country check (enrichBulk also filters, but guard here for counts)
      if (!lead.country || lead.country.toLowerCase() !== "united states") {
        discardedCount++;
        console.log(
          `[enrich:${batchId}] Discarded ${lead.fullName} — country: ${lead.country ?? "null"}`
        );
        continue;
      }

      for (const center of apolloIdToCenters.get(lead.apolloId) ?? []) {
        pairs.push({ lead, center });
      }
    }

    // 6. Save every lead in one bulk pass, then flip statuses in one bulk update
    const saveResults = await saveLeadsBulk(
      pairs.map(({ lead, center }) => ({
        apolloId: lead.apolloId,
        centerId: center.id,
        centerName: center.name,
        website: center.website ?? "",
        sourcePage: center.sourcePage ?? "",
        fullName: lead.fullName,
        email: lead.email,
        emailStatus: lead.emailStatus,
        linkedinUrl: lead.linkedinUrl,
        title: lead.title,
        org: lead.org,
        country: lead.country,
        sourceMethod: lead.sourceMethod,
      }))
    );

    const enrichedCenterIds = new Set<string>();
    let enrichedCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < pairs.length; i++) {
      if (saveResults[i] === "duplicate") {
        duplicateCount++;
        continue;
      }
      enrichedCenterIds.add(pairs[i].center.id);
      enrichedCount++;
    }

    await updateCenterStatuses([...enrichedCenterIds], "enriched");

    // 7. Mark every pending center that got no lead as not_found
    const notFoundIds = pendingCenters
      .filter((c) => !enrichedCenterIds.has(c.id))
      .map((c) => c.id);

    await updateCenterStatuses(notFoundIds, "not_found");
    const notFoundCount = notFoundIds.length;

    // 8. Persist cumulative totals to the batches row. enriched/notFound/skipped
    //    are counted from the centers table rather than tallied from this run, so
    //    re-running a partially processed batch tops the dashboard numbers up
    //    instead of overwriting them with only the latest run's counts.
    //    discarded has no center status to count from, so it accumulates.
    const totals = await getBatchStats(batchId);

    await updateBatchStats(batchId, {
      enriched: totals.enriched,
      notFound: totals.notFound,
      skipped: totals.skipped,
      discarded: totals.discarded + discardedCount,
    });

    const elapsedMs = Date.now() - startedAt;
    console.log(`[enrich:${batchId}] Completed in ${elapsedMs}ms`);

    // Response reports what *this* run did; the batches row above holds the totals.
    return NextResponse.json({
      batchId,
      enriched: enrichedCount,
      notFound: notFoundCount,
      skipped: totals.skipped,
      discarded: discardedCount,
      duplicates: duplicateCount,
      elapsedMs,
    });
  } catch (err) {
    console.error(`[POST /api/batches/${batchId}/enrich]`, err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
