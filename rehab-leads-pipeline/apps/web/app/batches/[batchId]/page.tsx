import { notFound } from "next/navigation";
import { getBatchById, getLeadsByBatch, getSkippedCentersByBatch, getBatchStats } from "@/lib/db";
import { BatchDetailClient } from "@/components/BatchDetailClient";

interface PageProps {
  params: { batchId: string };
}

export default async function BatchDetailPage({ params }: PageProps) {
  const { batchId } = params;

  const [batch, leads, skipped, stats] = await Promise.all([
    getBatchById(batchId),
    getLeadsByBatch(batchId),
    getSkippedCentersByBatch(batchId),
    getBatchStats(batchId),
  ]);

  if (!batch) notFound();

  return (
    <BatchDetailClient
      batchId={batchId}
      batch={batch}
      leads={leads}
      skipped={skipped}
      stats={stats}
    />
  );
}

export async function generateMetadata({ params }: PageProps) {
  const batch = await getBatchById(params.batchId);
  return {
    title: batch ? `${batch.label ?? "Batch"} — Rehab Leads Pipeline` : "Batch Not Found",
  };
}
