"use client";
/**
 * PinButton – fügt einen Ticker zur Watchlist hinzu / entfernt ihn.
 */
import { useState, useTransition } from "react";
import { showToast } from "@/components/Toast";

interface Props {
  ticker: string;
  reportId: string;
  initiallyPinned: boolean;
}

export function PinButton({ ticker, reportId, initiallyPinned }: Props) {
  const [pinned, setPinned] = useState(initiallyPinned);
  const [pending, start] = useTransition();

  function toggle() {
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
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Watchlist-Fehler", "error");
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
        pinned
          ? "border-accent-500/60 text-accent-400 bg-accent-500/10 hover:bg-accent-500/20"
          : "border-secondary-700 hover:border-accent-500 text-secondary-200"
      } disabled:opacity-50`}
      title={pinned ? "Von Watchlist entfernen" : "Auf Watchlist pinnen"}
      aria-pressed={pinned}
    >
      {pending ? "…" : pinned ? "Auf Watchlist · pinned" : "Auf Watchlist pinnen"}
    </button>
  );
}
