/**
 * Reports-Liste – server-side aus DB, mit Mehrfachauswahl und zentralen Aktionen.
 */
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/storage/db";
import { GlassCard } from "@/components/GlassCard";
import { ReportsBulkActionsList } from "@/components/ReportsBulkActionsList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ReportsPage() {
  const rows = db
    .select()
    .from(schema.reports)
    .orderBy(desc(schema.reports.createdAt))
    .limit(200)
    .all();

  const watchlistItems = db.select().from(schema.watchlist).all();
  const pinnedTickerSet = new Set(watchlistItems.map((w) => w.ticker.toUpperCase()));

  const prevByReport = new Map<string, string>();
  const byTicker = new Map<string, typeof rows>();
  for (const r of rows) {
    const t = r.ticker.toUpperCase();
    const arr = byTicker.get(t) ?? [];
    arr.push(r);
    byTicker.set(t, arr);
  }
  for (const [, arr] of byTicker) {
    const sorted = [...arr].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 1; i < sorted.length; i++) {
      prevByReport.set(sorted[i]!.id, sorted[i - 1]!.id);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-secondary-400 mt-1">
          {rows.length === 0 ? "Noch keine Reports vorhanden." : `${rows.length} Reports gespeichert.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <GlassCard className="p-6 text-sm text-secondary-400">
          Starte deinen ersten Research-Run auf der <Link href="/" className="text-accent-400 underline">Startseite</Link>.
        </GlassCard>
      ) : (
        <ReportsBulkActionsList
          rows={rows.map((r) => ({
            id: r.id,
            ticker: r.ticker,
            companyName: r.companyName,
            researchDate: r.researchDate,
            category: r.category,
            confidence: r.confidence,
            scoreTotal: r.scoreTotal,
            gate: r.gate,
            createdAt: r.createdAt,
          }))}
          prevByReport={Object.fromEntries(prevByReport.entries())}
          initiallyPinnedTickers={Array.from(pinnedTickerSet)}
        />
      )}
    </main>
  );
}
