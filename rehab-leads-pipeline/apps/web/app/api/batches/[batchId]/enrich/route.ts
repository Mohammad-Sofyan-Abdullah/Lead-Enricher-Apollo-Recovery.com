import { NextRequest, NextResponse } from "next/server";
import { searchByDomains, searchByName, enrichBulk } from "@rehab-leads/apollo";
import type { SearchResult } from "@rehab-leads/apollo";
import type { Center } from "@/lib/supabase";
import {
  getPendingCentersByBatch,
  saveLead,
  updateCenterStatus,
  updateBatchStats,
  getSkippedCount,
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
    const domainCenters = pendingCenters.filter((c) => !c.no_website && c.domain);
    const nameCenters = pendingCenters.filter((c) => c.no_website);

    // 3. Build apolloId → Center[] mapping during the search phase
    //    so enriched leads can be matched back to their source centers.
    const apolloIdToCenters = new Map<string, Center[]>();
    const allSearchResults: SearchResult[] = [];

    // Domain search — deduplicate domains, batch internally in searchByDomains
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

    // Name search — one request per center
    for (const center of nameCenters) {
      const result = await searchByName(center.name);
      if (!result) continue;

      const existing = apolloIdToCenters.get(result.apolloId) ?? [];
      apolloIdToCenters.set(result.apolloId, [...existing, center]);

      // Guard against duplicate SearchResult entries (same person found via different paths)
      if (!allSearchResults.some((r) => r.apolloId === result.apolloId)) {
        allSearchResults.push(result);
      }
    }

    // 4. Enrich all search results (bulk_match, batched in 10s, US filter applied inside)
    const enrichedLeads = await enrichBulk(allSearchResults);

    // 5. Process each enriched lead
    const enrichedCenterIds = new Set<string>();
    let enrichedCount = 0;
    let discardedCount = 0;
    let duplicateCount = 0;

    for (const lead of enrichedLeads) {
      // Safety net country check (enrichBulk also filters, but guard here for counts)
      if (!lead.country || lead.country.toLowerCase() !== "united states") {
        discardedCount++;
        console.log(
          `[enrich:${batchId}] Discarded ${lead.fullName} — country: ${lead.country ?? "null"}`
        );
        continue;
      }

      const matchingCenters = apolloIdToCenters.get(lead.apolloId) ?? [];

      for (const center of matchingCenters) {
        const saveResult = await saveLead({
          apolloId: lead.apolloId,
          centerId: center.id,
          centerName: center.name,
          website: center.website ?? "",
          sourcePage: center.source_page ?? "",
          fullName: lead.fullName,
          email: lead.email,
          emailStatus: lead.emailStatus,
          linkedinUrl: lead.linkedinUrl,
          title: lead.title,
          org: lead.org,
          country: lead.country,
          sourceMethod: lead.sourceMethod,
        });

        if (saveResult === "duplicate") {
          duplicateCount++;
          continue;
        }

        await updateCenterStatus(center.id, "enriched");
        enrichedCenterIds.add(center.id);
        enrichedCount++;
      }
    }

    // 6. Mark every pending center that got no lead as not_found
    let notFoundCount = 0;
    for (const center of pendingCenters) {
      if (!enrichedCenterIds.has(center.id)) {
        await updateCenterStatus(center.id, "not_found");
        notFoundCount++;
      }
    }

    // 7. Get skipped center count (saved as 'skipped' during batch creation)
    const skippedCount = await getSkippedCount(batchId);

    // 8. Persist final stats to the batches row
    await updateBatchStats(batchId, {
      enriched: enrichedCount,
      notFound: notFoundCount,
      skipped: skippedCount,
      discarded: discardedCount,
    });

    return NextResponse.json({
      batchId,
      enriched: enrichedCount,
      notFound: notFoundCount,
      skipped: skippedCount,
      discarded: discardedCount,
      duplicates: duplicateCount,
    });
  } catch (err) {
    console.error(`[POST /api/batches/${batchId}/enrich]`, err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
