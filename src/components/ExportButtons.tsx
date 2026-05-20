"use client";
/**
 * ExportButtons – lädt PDF/XLSX/PPTX über die API.
 */
import { useState } from "react";
import { showToast } from "@/components/Toast";

interface Props {
  reportId: string;
  ticker: string;
}

const FORMATS = [
  { fmt: "xlsx", label: "Excel", icon: "📊" },
  { fmt: "pptx", label: "PowerPoint", icon: "📑" },
  { fmt: "pdf", label: "PDF", icon: "📄" },
] as const;

export function ExportButtons({ reportId, ticker }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

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
      {FORMATS.map((f) => (
        <button
          key={f.fmt}
          onClick={() => download(f.fmt)}
          disabled={busy !== null}
          className="px-3 py-1.5 text-xs border border-secondary-700 hover:border-accent-500 disabled:opacity-50 rounded-md transition-colors"
          title={`Export als ${f.label}`}
        >
          <span className="mr-1">{f.icon}</span>
          {busy === f.fmt ? "…" : f.label}
        </button>
      ))}
    </div>
  );
}
