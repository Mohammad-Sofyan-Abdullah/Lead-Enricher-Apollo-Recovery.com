import { NextResponse } from "next/server";

const HEALTH_URL = "https://api.apollo.io/api/v1/auth/health";
const SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search";

export async function POST() {
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: "APOLLO_API_KEY is not set" });
  }

  // Apollo authenticates via x-api-key. It does NOT support Authorization: Bearer —
  // a Bearer request is treated as unauthenticated and 401s regardless of the key.
  const headers = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "accept": "application/json",
    "x-api-key": apiKey,
  };

  try {
    // Stage 1 — is the key itself accepted? Distinguishes a bad key from an Apollo outage.
    const health = await fetch(HEALTH_URL, { method: "GET", headers });

    if (!health.ok) {
      return NextResponse.json({
        success: false,
        error: `Apollo unreachable: HTTP ${health.status}`,
      });
    }

    // auth/health returns HTTP 200 even for a rejected key — the verdict is in the body.
    const healthBody = await health.json();
    if (healthBody?.is_logged_in !== true) {
      return NextResponse.json({
        success: false,
        error: "API key rejected by Apollo — check APOLLO_API_KEY in Netlify",
      });
    }

    // Stage 2 — the key is valid; confirm it can actually run the search the pipeline uses.
    const search = await fetch(SEARCH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        person_titles: ["ceo"],
        person_locations: ["United States"],
        per_page: 1,
        page: 1,
      }),
    });

    if (search.status === 401 || search.status === 403) {
      return NextResponse.json({
        success: false,
        error: `Key valid but lacks search access (HTTP ${search.status})`,
      });
    }

    if (search.status === 429) {
      return NextResponse.json({
        success: false,
        error: "Rate limited by Apollo — try again shortly",
      });
    }

    if (!search.ok) {
      return NextResponse.json({
        success: false,
        error: `Apollo search failed: HTTP ${search.status}`,
      });
    }

    return NextResponse.json({ success: true, message: "Apollo API key is valid" });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
