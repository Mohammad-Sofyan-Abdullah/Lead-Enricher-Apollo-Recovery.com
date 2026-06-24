import { NextResponse } from "next/server";
import { supabase, TABLES } from "@/lib/supabase";

export async function POST() {
  try {
    const { count, error } = await supabase
      .from(TABLES.batches)
      .select("*", { count: "exact", head: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, count: count ?? 0 });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
