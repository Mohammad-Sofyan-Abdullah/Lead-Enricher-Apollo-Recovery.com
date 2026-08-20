import { NextResponse } from "next/server";
import { getAllBatches } from "@/lib/db";

// This handler reads nothing from the request, so Next.js would statically
// optimise it — baking the batch list at build time and letting the CDN serve
// it with a one-year TTL. The dashboard then never reflects new or updated
// batches. Force it to run per request.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const batches = await getAllBatches();
    return NextResponse.json({ batches });
  } catch (err) {
    console.error("[GET /api/batches]", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
