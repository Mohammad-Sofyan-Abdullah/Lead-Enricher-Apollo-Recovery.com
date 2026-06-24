import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { parseRawInput, cleanCenters } from "@rehab-leads/cleaner";
import { saveBatch, saveCenters } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { label, rawText } = body as { label?: string; rawText?: string };

    if (!label?.trim()) {
      return NextResponse.json(
        { error: "Validation error", detail: "label is required" },
        { status: 400 }
      );
    }
    if (!rawText?.trim()) {
      return NextResponse.json(
        { error: "Validation error", detail: "rawText is required" },
        { status: 400 }
      );
    }

    const rawCenters = parseRawInput(rawText);
    const centers = cleanCenters(rawCenters);

    const batchId = nanoid();

    await saveBatch({ id: batchId, label: label.trim(), totalCenters: centers.length });
    await saveCenters(centers, batchId);

    const valid = centers.filter((c) => c.status === "valid");
    const skipped = centers.filter((c) => c.status === "skipped");
    const noWebsite = valid.filter((c) => c.noWebsite);

    const skipReasons: Record<string, number> = {};
    for (const c of skipped) {
      const reason = c.skipReason ?? "unknown";
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    }

    return NextResponse.json({
      batchId,
      summary: {
        total: centers.length,
        valid: valid.length,
        skipped: skipped.length,
        noWebsite: noWebsite.length,
        skipReasons,
      },
      centers,
    });
  } catch (err) {
    console.error("[POST /api/batches/create]", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
