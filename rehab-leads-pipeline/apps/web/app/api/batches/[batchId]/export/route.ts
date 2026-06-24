import { NextRequest, NextResponse } from "next/server";
import { exportCSV, exportXLSX, buildFilename } from "@rehab-leads/exporter";
import { getLeadsByBatch, getSkippedCentersByBatch, getAllBatches } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const { batchId } = params;
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!batchId?.trim()) {
    return NextResponse.json(
      { error: "Validation error", detail: "batchId is required" },
      { status: 400 }
    );
  }

  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json(
      { error: "Validation error", detail: "format must be 'csv' or 'xlsx'" },
      { status: 400 }
    );
  }

  try {
    // Resolve batch label for the filename
    const batches = await getAllBatches();
    const batch = batches.find((b) => b.id === batchId);

    if (!batch) {
      return NextResponse.json(
        { error: "Not found", detail: `Batch ${batchId} not found` },
        { status: 404 }
      );
    }

    const leads = await getLeadsByBatch(batchId);
    const skipped = await getSkippedCentersByBatch(batchId);
    const label = batch.label ?? batchId;
    const filename = buildFilename(label, format as "csv" | "xlsx");

    if (format === "xlsx") {
      const buffer = await exportXLSX(leads);
      const body = new Uint8Array(buffer);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": body.byteLength.toString(),
        },
      });
    }

    // CSV
    const csv = exportCSV(leads);
    const body = new TextEncoder().encode(csv);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": body.byteLength.toString(),
      },
    });
  } catch (err) {
    console.error(`[GET /api/batches/${batchId}/export]`, err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
