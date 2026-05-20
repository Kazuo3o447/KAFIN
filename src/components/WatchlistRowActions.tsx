"use client";
/**
 * WatchlistRowActions – Inline-Edit für Notes + Unpin-Button.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";

interface Props {
  ticker: string;
  initialNotes: string | null;
}

export function WatchlistRowActions({ ticker, initialNotes }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        const r = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ticker, notes }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setEditing(false);
        showToast("Notiz gespeichert", "success");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Speichern fehlgeschlagen", "error");
      }
    });
  }

  function unpin() {
    if (!confirm(`${ticker} von der Watchlist entfernen?`)) return;
    start(async () => {
      try {
        const r = await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        showToast(`${ticker} entfernt`, "info");
        router.refresh();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Entfernen fehlgeschlagen", "error");
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 w-full">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Notiz …"
          className="flex-1 bg-secondary-900 border border-secondary-700 focus:border-accent-500 rounded px-2 py-1 text-sm outline-none"
          autoFocus
        />
        <button
          onClick={save}
          disabled={pending}
          className="px-2 py-1 text-xs border border-accent-500/60 text-accent-400 hover:bg-accent-500/10 rounded disabled:opacity-50"
        >
          {pending ? "…" : "Speichern"}
        </button>
        <button
          onClick={() => {
            setNotes(initialNotes ?? "");
            setEditing(false);
          }}
          disabled={pending}
          className="px-2 py-1 text-xs border border-secondary-700 hover:border-secondary-500 rounded disabled:opacity-50"
        >
          Abbruch
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setEditing(true)}
        className="px-2 py-1 text-xs border border-secondary-700 hover:border-accent-500 rounded"
        title="Notiz bearbeiten"
      >
        Notiz
      </button>
      <button
        onClick={unpin}
        disabled={pending}
        className="px-2 py-1 text-xs border border-secondary-700 hover:border-red-500/60 hover:text-red-400 rounded disabled:opacity-50"
        title="Von Watchlist entfernen"
      >
        Unpin
      </button>
    </div>
  );
}
