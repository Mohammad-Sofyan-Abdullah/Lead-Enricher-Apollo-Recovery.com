import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { parseRawInput, cleanCenters } from "@rehab-leads/cleaner";
import { saveBatch, saveCenters } from "@/lib/db";
import type { RawCenter } from "@pipeline/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { label, rawText, centers: rawCenters } = body as {
      label?: string;
      rawText?: string;
      centers?: RawCenter[];
    };

    if (!label?.trim()) {
      return NextResponse.json(
        { error: "Validation error", detail: "label is required" },
        { status: 400 }
      );
    }

    let parsed: RawCenter[];

    if (Array.isArray(rawCenters) && rawCenters.length > 0) {
      parsed = rawCenters;
    } else if (rawText?.trim()) {
      parsed = parseRawInput(rawText);
    } else {
      return NextResponse.json(
        { error: "Validation error", detail: "centers or rawText is required" },
        { status: 400 }
      );
    }

    const centers = cleanCenters(parsed);

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
