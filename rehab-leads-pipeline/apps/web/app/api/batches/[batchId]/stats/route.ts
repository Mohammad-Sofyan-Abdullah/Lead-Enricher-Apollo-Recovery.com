import { NextRequest, NextResponse } from "next/server";
import { getBatchStats } from "@/lib/db";

export async function GET(
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
    const stats = await getBatchStats(batchId);
    return NextResponse.json({ batchId, stats });
  } catch (err) {
    console.error(`[GET /api/batches/${batchId}/stats]`, err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
