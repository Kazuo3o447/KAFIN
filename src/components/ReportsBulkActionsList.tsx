"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";

interface ReportRow {
  id: string;
  ticker: string;
  companyName: string | null;
  researchDate: string;
  category: string | null;
  confidence: string | null;
  scoreTotal: number | null;
  gate: string | null;
  createdAt: number;
}

interface Props {
  rows: ReportRow[];
  prevByReport: Record<string, string>;
  initiallyPinnedTickers: string[];
}

const GATE_BADGE: Record<string, string> = {
  Green: "bg-green-700/20 text-green-300 border-green-700/40",
  Yellow: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  Red: "bg-red-700/20 text-red-300 border-red-700/40",
};

export function ReportsBulkActionsList({ rows, prevByReport, initiallyPinnedTickers }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const pinnedSet = useMemo(() => new Set(initiallyPinnedTickers.map((t) => t.toUpperCase())), [initiallyPinnedTickers]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  const allChecked = rows.length > 0 && selectedIds.size === rows.length;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(() => {
      if (allChecked) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  async function addToWatchlist() {
    if (selectedRows.length === 0) return;
    const byTicker = new Map<string, ReportRow>();
    for (const row of selectedRows) {
      const key = row.ticker.toUpperCase();
      const current = byTicker.get(key);
      if (!current || row.createdAt > current.createdAt) byTicker.set(key, row);
    }
    const entries = Array.from(byTicker.values());

    for (const row of entries) {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: row.ticker, lastReportId: row.id }),
      });
      if (!r.ok) throw new Error(`Watchlist-Fehler bei ${row.ticker}`);
    }
  }

  async function removeFromWatchlist() {
    if (selectedRows.length === 0) return;
    const tickers = Array.from(new Set(selectedRows.map((r) => r.ticker.toUpperCase())));
    for (const ticker of tickers) {
      const r = await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`Watchlist-Fehler bei ${ticker}`);
    }
  }

  async function deleteReports() {
    if (selectedRows.length === 0) return;
    for (const row of selectedRows) {
      const r = await fetch(`/api/reports/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Löschen fehlgeschlagen bei ${row.id}`);
    }
  }

  function runAction(kind: "watchlist_add" | "watchlist_remove" | "delete") {
    if (selectedRows.length === 0) {
      showToast("Bitte zuerst mindestens einen Report auswählen.", "info");
      return;
    }
    if (kind === "delete" && !confirm(`${selectedRows.length} Report(s) wirklich löschen?`)) {
      return;
    }

    start(async () => {
      try {
        if (kind === "watchlist_add") {
          await addToWatchlist();
          showToast("Ausgewählte Unternehmen auf Watchlist gesetzt.", "success");
        } else if (kind === "watchlist_remove") {
          await removeFromWatchlist();
          showToast("Ausgewählte Unternehmen von Watchlist entfernt.", "info");
        } else {
          await deleteReports();
          showToast("Ausgewählte Reports gelöscht.", "info");
          setSelectedIds(new Set());
        }
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Aktion fehlgeschlagen", "error");
      }
    });
  }

  return (
    <>
      <div className="glass-card p-4 flex flex-wrap items-center gap-2 border border-secondary-800/80">
        <button
          onClick={() => runAction("watchlist_add")}
          disabled={pending || selectedRows.length === 0}
          className="px-3 py-1.5 text-xs rounded border border-accent-500/60 text-accent-300 hover:bg-accent-500/10 disabled:opacity-50"
        >
          Auf Watchlist setzen
        </button>
        <button
          onClick={() => runAction("watchlist_remove")}
          disabled={pending || selectedRows.length === 0}
          className="px-3 py-1.5 text-xs rounded border border-secondary-700 text-secondary-200 hover:border-accent-500 disabled:opacity-50"
        >
          Von Watchlist entfernen
        </button>
        <button
          onClick={() => runAction("delete")}
          disabled={pending || selectedRows.length === 0}
          className="px-3 py-1.5 text-xs rounded border border-secondary-700 text-secondary-200 hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
        >
          Löschen
        </button>
        <div className="ml-auto text-xs text-secondary-400">
          {selectedRows.length} ausgewählt
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map((r) => {
          const prevId = prevByReport[r.id];
          const isSelected = selectedIds.has(r.id);
          const isPinned = pinnedSet.has(r.ticker.toUpperCase());

          return (
            <li key={r.id}>
              <div className="glass-card p-4 flex items-center gap-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent-500"
                  checked={isSelected}
                  onChange={() => toggleOne(r.id)}
                  aria-label={`Report ${r.id} auswählen`}
                />
                <Link href={`/reports/${r.id}`} className="font-mono text-lg text-accent-400 w-20 hover:underline">
                  {r.ticker}
                </Link>
                <Link href={`/reports/${r.id}`} className="flex-1 min-w-0 hover:opacity-80">
                  <div className="text-sm font-medium truncate">
                    {r.companyName || "—"} <span className="text-secondary-500">· {r.researchDate}</span>
                  </div>
                  <div className="text-xs text-secondary-500 mt-0.5">
                    {r.category ?? "—"} · Confidence {r.confidence ?? "—"}
                    {isPinned ? " · Watchlist" : ""}
                  </div>
                </Link>
                <Link href={`/reports/${r.id}`} className="text-right hover:opacity-80">
                  <div className="text-2xl font-semibold">{r.scoreTotal ?? 0}</div>
                  <div className="text-[10px] uppercase text-secondary-500">/ 100</div>
                </Link>
                <span
                  className={`text-xs uppercase tracking-wide px-2 py-1 rounded border ${
                    GATE_BADGE[r.gate ?? ""] ?? "border-secondary-700 text-secondary-400"
                  }`}
                >
                  {r.gate ?? "—"}
                </span>
                {prevId ? (
                  <Link
                    href={`/reports/compare/${prevId}/${r.id}`}
                    className="px-3 py-1.5 text-xs border border-secondary-700 hover:border-accent-500 rounded-md whitespace-nowrap"
                    title="Mit Vorgänger-Report vergleichen"
                  >
                    vs. Vorgänger
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="text-xs text-secondary-500 flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent-500"
          checked={allChecked}
          onChange={toggleAll}
          aria-label="Alle Reports auswählen"
        />
        <span>Alle auswählen</span>
      </div>
    </>
  );
}
