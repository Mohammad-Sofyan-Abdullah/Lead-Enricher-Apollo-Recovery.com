import { NextRequest, NextResponse } from "next/server";
import { deleteBatch } from "@/lib/db";

export async function DELETE(
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
    await deleteBatch(batchId);
    return NextResponse.json({ success: true, batchId });
  } catch (err) {
    console.error(`[DELETE /api/batches/${batchId}]`, err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
