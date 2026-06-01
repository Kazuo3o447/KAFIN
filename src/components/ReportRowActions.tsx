"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";

interface Props {
  reportId: string;
  ticker: string;
  initiallyPinned: boolean;
}

export function ReportRowActions({ reportId, ticker, initiallyPinned }: Props) {
  const router = useRouter();
  const [pinned, setPinned] = useState(initiallyPinned);
  const [pending, start] = useTransition();

  function toggleWatchlist() {
    start(async () => {
      try {
        if (pinned) {
          const r = await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, {
            method: "DELETE",
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          setPinned(false);
          showToast(`${ticker} von Watchlist entfernt`, "info");
        } else {
          const r = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticker, lastReportId: reportId }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          setPinned(true);
          showToast(`${ticker} zur Watchlist gepinnt`, "success");
        }
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Watchlist-Fehler", "error");
      }
    });
  }

  function deleteReport() {
    if (!confirm(`Report ${reportId} wirklich loeschen?`)) return;
    start(async () => {
      try {
        const r = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        showToast(`Report ${reportId} geloescht`, "info");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Loeschen fehlgeschlagen", "error");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleWatchlist}
        disabled={pending}
        className={`px-2 py-1 text-xs rounded border transition-colors disabled:opacity-50 ${
          pinned
            ? "border-accent-500/60 text-accent-400 bg-accent-500/10 hover:bg-accent-500/20"
            : "border-secondary-700 hover:border-accent-500 text-secondary-200"
        }`}
        title={pinned ? "Von Watchlist entfernen" : "Auf Watchlist setzen"}
      >
        {pinned ? "Watchlist entfernen" : "Auf Watchlist"}
      </button>
      <button
        onClick={deleteReport}
        disabled={pending}
        className="px-2 py-1 text-xs rounded border border-secondary-700 hover:border-red-500/60 hover:text-red-400 disabled:opacity-50"
        title="Report loeschen"
      >
        Loeschen
      </button>
    </div>
  );
}
