/**
 * Watchlist – Server Component liest watchlist + letzten Report je Ticker.
 */
import Link from "next/link";
import { db, schema } from "@/lib/storage/db";
import { desc, eq } from "drizzle-orm";
import { GlassCard } from "@/components/GlassCard";
import { WatchlistRowActions } from "@/components/WatchlistRowActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function WatchlistPage() {
  const items = db.select().from(schema.watchlist).all();

  const enriched = items.map((w) => {
    const last = db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.ticker, w.ticker))
      .orderBy(desc(schema.reports.createdAt))
      .limit(1)
      .get();
    return { ...w, last };
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-sm text-secondary-400 mt-1">
          {items.length === 0 ? "Noch keine Tickers gepinnt." : `${items.length} pinned.`}
        </p>
      </header>

      {items.length === 0 ? (
        <GlassCard className="p-6 text-sm text-secondary-400">
          Noch keine Tickers gepinnt. Öffne einen Report und nutze den Button{" "}
          <span className="text-accent-400">Auf Watchlist pinnen</span>.
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {enriched.map((w) => (
            <li key={w.ticker}>
              <GlassCard className="p-4 flex items-center gap-4 flex-wrap">
                <div className="font-mono text-lg text-accent-400 w-20">{w.ticker}</div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm text-secondary-200">{w.notes ?? "—"}</div>
                  <div className="text-xs text-secondary-500">
                    Hinzugefügt: {new Date(w.addedAt).toLocaleDateString("de-DE")}
                  </div>
                </div>
                {w.last ? (
                  <Link
                    href={`/reports/${w.last.id}`}
                    className="px-3 py-1.5 border border-secondary-700 hover:border-accent-500 rounded-md text-xs"
                  >
                    Letzter Report → {w.last.scoreTotal}/100
                  </Link>
                ) : (
                  <span className="text-xs text-secondary-500">noch kein Report</span>
                )}
                <WatchlistRowActions ticker={w.ticker} initialNotes={w.notes} />
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
