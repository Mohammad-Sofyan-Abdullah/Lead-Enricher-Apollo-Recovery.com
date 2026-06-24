import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: "APOLLO_API_KEY is not set" });
  }

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        api_key: apiKey,
        per_page: 1,
        page: 1,
        q_organization_domains_list: ["test.com"],
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ success: false, error: `Invalid API key (HTTP ${res.status})` });
    }

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: `Apollo API returned HTTP ${res.status}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
