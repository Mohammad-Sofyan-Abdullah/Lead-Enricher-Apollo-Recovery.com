import { NextRequest, NextResponse } from "next/server";
import { exportCSV, exportXLSX, buildFilename } from "@rehab-leads/exporter";
import { getLeadsByBatch } from "@/lib/db";
import type { OutputLead } from "@rehab-leads/exporter";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchIdsParam = searchParams.get("batchIds") ?? "";
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!batchIdsParam.trim()) {
    return NextResponse.json(
      { error: "Validation error", detail: "batchIds is required" },
      { status: 400 }
    );
  }

  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json(
      { error: "Validation error", detail: "format must be 'csv' or 'xlsx'" },
      { status: 400 }
    );
  }

  const batchIds = batchIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (batchIds.length === 0) {
    return NextResponse.json(
      { error: "Validation error", detail: "At least one batchId is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch leads for all batches in parallel
    const perBatchLeads = await Promise.all(batchIds.map((id) => getLeadsByBatch(id)));

    // Merge and deduplicate: keyed by email (primary) or name+org (fallback)
    const seen = new Set<string>();
    const merged: OutputLead[] = [];

    for (const leads of perBatchLeads) {
      for (const lead of leads) {
        const key = lead.email?.trim()
          ? lead.email.trim().toLowerCase()
          : `name:${lead.name.trim().toLowerCase()}|org:${lead.org?.trim().toLowerCase() ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(lead);
        }
      }
    }

    // Sort by center name ascending
    merged.sort((a, b) => a.centerName.localeCompare(b.centerName));

    const filename = buildFilename("combined_export", format as "csv" | "xlsx");

    if (format === "xlsx") {
      const buffer = await exportXLSX(merged);
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

    const csv = exportCSV(merged);
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
    console.error("[GET /api/batches/export-combined]", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
