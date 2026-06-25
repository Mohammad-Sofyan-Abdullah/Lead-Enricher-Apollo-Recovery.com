"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText } from "lucide-react";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  onClear: () => void;
  selectedFile: File | null;
  accept: string;
  maxSizeMB: number;
  helpText?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({
  onFileSelect,
  onClear,
  selectedFile,
  accept,
  maxSizeMB,
  helpText = "Expected columns: Center Name, Website URL, Source Page",
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(
    (file: File): string | null => {
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File exceeds ${maxSizeMB} MB limit`;
      }
      // Extension check is intentionally omitted here — the parent's onFileSelect
      // performs magic-byte detection and shows richer, context-aware error messages.
      return null;
    },
    [maxSizeMB]
  );

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file);
      if (err) { setError(err); return; }
      setError(null);
      onFileSelect(file);
    },
    [validate, onFileSelect]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  if (selectedFile) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-gray-400 shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate">
            {selectedFile.name}
          </span>
          <span className="text-xs text-gray-400 shrink-0">
            {formatBytes(selectedFile.size)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors shrink-0"
        >
          <X size={13} /> Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`w-full rounded-xl border-2 border-dashed px-6 py-10 flex flex-col items-center gap-2 transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
        }`}
      >
        <Upload
          size={24}
          className={dragOver ? "text-blue-500" : "text-gray-400"}
        />
        <p
          className={`text-sm font-medium ${
            dragOver ? "text-blue-700" : "text-gray-700"
          }`}
        >
          Drop your CSV file here or{" "}
          <span className="underline underline-offset-2">click to browse</span>
        </p>
        <p className="text-xs text-gray-400">{helpText}</p>
      </button>
      {error && (
        <p className="mt-1.5 text-xs text-red-600">⚠ {error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
