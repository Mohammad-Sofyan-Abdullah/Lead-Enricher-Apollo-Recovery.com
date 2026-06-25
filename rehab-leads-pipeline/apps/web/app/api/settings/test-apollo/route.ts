import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: "APOLLO_API_KEY is not set" });
  }

  try {
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        person_titles: ["ceo"],
        person_locations: ["United States"],
        per_page: 1,
        page: 1,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ success: false, error: `Invalid API key (HTTP ${res.status})` });
    }

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: `Apollo unreachable: HTTP ${res.status}`,
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
