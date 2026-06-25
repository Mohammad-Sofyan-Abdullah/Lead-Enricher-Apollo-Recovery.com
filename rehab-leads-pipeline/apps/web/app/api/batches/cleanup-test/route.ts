import { NextRequest, NextResponse } from "next/server";
import { supabase, TABLES } from "@/lib/supabase";

const CHUNK = 50;

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { label?: string };
    const label = body.label?.trim();
    if (!label) {
      return NextResponse.json(
        { error: "Validation error", detail: "label is required" },
        { status: 400 }
      );
    }

    // 1. Find all batches with this exact label
    const { data: batches, error: batchesErr } = await supabase
      .from(TABLES.batches)
      .select("id")
      .eq("label", label);

    if (batchesErr) throw batchesErr;
    if (!batches?.length) return NextResponse.json({ deleted: 0 });

    const batchIds = batches.map((b: { id: string }) => b.id);

    // 2. Collect all center IDs for these batches (chunked)
    const allCenterIds: string[] = [];
    for (let i = 0; i < batchIds.length; i += CHUNK) {
      const { data: centers, error: centersErr } = await supabase
        .from(TABLES.centers)
        .select("id")
        .in("batch_id", batchIds.slice(i, i + CHUNK));
      if (centersErr) throw centersErr;
      if (centers) allCenterIds.push(...centers.map((c: { id: string }) => c.id));
    }

    // 3. Delete leads (chunked by center_id)
    for (let i = 0; i < allCenterIds.length; i += CHUNK) {
      const { error } = await supabase
        .from(TABLES.leads)
        .delete()
        .in("center_id", allCenterIds.slice(i, i + CHUNK));
      if (error) throw error;
    }

    // 4. Delete centers (chunked by batch_id)
    for (let i = 0; i < batchIds.length; i += CHUNK) {
      const { error } = await supabase
        .from(TABLES.centers)
        .delete()
        .in("batch_id", batchIds.slice(i, i + CHUNK));
      if (error) throw error;
    }

    // 5. Delete batches (chunked)
    for (let i = 0; i < batchIds.length; i += CHUNK) {
      const { error } = await supabase
        .from(TABLES.batches)
        .delete()
        .in("id", batchIds.slice(i, i + CHUNK));
      if (error) throw error;
    }

    return NextResponse.json({ deleted: batchIds.length });
  } catch (err) {
    console.error("[DELETE /api/batches/cleanup-test]", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
