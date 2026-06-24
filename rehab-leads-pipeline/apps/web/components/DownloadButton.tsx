"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadFile } from "@/lib/download";
import { buildFilename } from "@rehab-leads/exporter";
import { cn } from "@/lib/utils";

interface DownloadButtonProps {
  batchId: string;
  format: "csv" | "xlsx";
  label: string;
  variant?: "default" | "ghost";
  className?: string;
}

export function DownloadButton({
  batchId,
  format,
  label,
  variant = "default",
  className,
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const filename = buildFilename(label || batchId, format);
      const url = `/api/batches/${batchId}/export?format=${format}`;
      await downloadFile(url, filename);
    } finally {
      setLoading(false);
    }
  };

  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60";
  const variants = {
    default: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    ghost:   "text-gray-600 hover:bg-gray-100",
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(base, variants[variant], className)}
      title={`Download ${format.toUpperCase()}`}
    >
      <Download size={13} />
      {loading ? "…" : format.toUpperCase()}
    </button>
  );
}
