"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

function TestButton({
  endpoint,
  label,
}: {
  endpoint: string;
  label: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [detail, setDetail] = useState("");

  const run = async () => {
    setStatus("loading");
    setDetail("");
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setStatus("ok");
      } else {
        setStatus("fail");
        setDetail(json.error ?? "Unknown error");
      }
    } catch (err) {
      setStatus("fail");
      setDetail(String(err));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={run}
        disabled={status === "loading"}
        className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-60 transition-colors self-start"
      >
        {status === "loading" ? (
          <><Loader2 size={14} className="animate-spin" />Testing…</>
        ) : (
          label
        )}
      </button>

      {status === "ok" && (
        <p className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
          <CheckCircle size={16} /> Connected
        </p>
      )}
      {status === "fail" && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <XCircle size={16} /> Failed{detail ? `: ${detail}` : ""}
        </p>
      )}
    </div>
  );
}

function MaskedInput({ value }: { value: string }) {
  return (
    <input
      readOnly
      value={value}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700 font-mono focus:outline-none"
    />
  );
}

export default function SettingsPage() {
  const supabaseUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "Not configured")
      : "";

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Connection status and configuration
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supabase card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Supabase Connection</h2>
            <p className="text-xs text-gray-500 mt-0.5">Database for batches and leads</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              NEXT_PUBLIC_SUPABASE_URL
            </label>
            <MaskedInput value={supabaseUrl || "Not configured"} />
          </div>
          <TestButton
            endpoint="/api/settings/test-supabase"
            label="Test Connection"
          />
        </div>

        {/* Apollo card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Apollo Connection</h2>
            <p className="text-xs text-gray-500 mt-0.5">Lead search and enrichment API</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              APOLLO_API_KEY
            </label>
            <MaskedInput value="Configured server-side (masked)" />
          </div>
          <TestButton
            endpoint="/api/settings/test-apollo"
            label="Test Connection"
          />
        </div>
      </div>
    </div>
  );
}
