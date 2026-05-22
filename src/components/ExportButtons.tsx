"use client";
/**
 * ExportButtons – lädt Exportformate über ein Dropdown-Menü.
 */
import { useState } from "react";
import { showToast } from "@/components/Toast";

interface Props {
  reportId: string;
  ticker: string;
}

const FORMATS = [
  { fmt: "xlsx", label: "Excel", icon: "📊" },
  { fmt: "json", label: "JSON", icon: "🧾" },
  { fmt: "pdf", label: "PDF", icon: "📄" },
] as const;

export function ExportButtons({ reportId, ticker }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  async function download(fmt: (typeof FORMATS)[number]["fmt"]) {
    setBusy(fmt);
    try {
      const r = await fetch(`/api/reports/${reportId}/export/${fmt}`, { method: "GET" });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(err.detail ?? err.error ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`${fmt.toUpperCase()} heruntergeladen`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export fehlgeschlagen", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-secondary-500" htmlFor={`export-${reportId}`}>Export</label>
      <select
        id={`export-${reportId}`}
        value={selected}
        disabled={busy !== null}
        onChange={(e) => {
          const fmt = e.target.value as (typeof FORMATS)[number]["fmt"] | "";
          setSelected("");
          if (!fmt) return;
          void download(fmt);
        }}
        className="px-3 py-1.5 text-xs border border-secondary-700 bg-secondary-900 hover:border-accent-500 disabled:opacity-50 rounded-md transition-colors"
      >
        <option value="">Format wählen…</option>
        {FORMATS.map((f) => (
          <option key={f.fmt} value={f.fmt}>
            {busy === f.fmt ? "…" : `${f.icon} ${f.label}`}
          </option>
        ))}
      </select>
    </div>
  );
}
