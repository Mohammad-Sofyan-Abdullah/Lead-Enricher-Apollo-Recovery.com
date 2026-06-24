import { NextResponse } from "next/server";
import { getAllBatches } from "@/lib/db";

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
