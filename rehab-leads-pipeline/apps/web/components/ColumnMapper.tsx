"use client";

import type { ColumnMapping } from "@/lib/csvImport";

interface ColumnMapperProps {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

export function ColumnMapper({ headers, mapping, onChange }: ColumnMapperProps) {
  const selectClass =
    "px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/40 bg-white";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
      <p className="text-sm font-medium text-amber-800">
        Map your CSV columns to the expected fields:
      </p>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 items-center text-sm">
        {/* Center Name — required */}
        <label className="text-gray-700 font-medium whitespace-nowrap">
          Center Name <span className="text-red-500">*</span>
        </label>
        <select
          value={mapping.name ?? ""}
          onChange={(e) =>
            onChange({ ...mapping, name: e.target.value || null })
          }
          className={`${selectClass} ${
            !mapping.name ? "border-red-400 focus:ring-red-300" : ""
          }`}
        >
          <option value="">— Select column —</option>
          {headers.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        {/* Website URL — optional */}
        <label className="text-gray-700 whitespace-nowrap">Website URL</label>
        <select
          value={mapping.website ?? ""}
          onChange={(e) =>
            onChange({ ...mapping, website: e.target.value || null })
          }
          className={selectClass}
        >
          <option value="">— None —</option>
          {headers.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        {/* Source Page — optional */}
        <label className="text-gray-700 whitespace-nowrap">Source Page</label>
        <select
          value={mapping.sourcePage ?? ""}
          onChange={(e) =>
            onChange({ ...mapping, sourcePage: e.target.value || null })
          }
          className={selectClass}
        >
          <option value="">— None —</option>
          {headers.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      </div>

      {!mapping.name && (
        <p className="text-xs text-red-600 mt-1">
          ⚠ Center Name is required to proceed
        </p>
      )}
    </div>
  );
}
