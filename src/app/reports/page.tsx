/**
 * Reports-Liste – server-side aus DB. Inkl. "Vergleichen mit Vorgänger"-Button,
 * wenn ein älterer Report desselben Tickers existiert.
 */
import Link from "next/link";
import { db, schema } from "@/lib/storage/db";
import { desc } from "drizzle-orm";
import { GlassCard } from "@/components/GlassCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GATE_BADGE: Record<string, string> = {
  Green: "bg-green-700/20 text-green-300 border-green-700/40",
  Yellow: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  Red: "bg-red-700/20 text-red-300 border-red-700/40",
};

export default function ReportsPage() {
  const rows = db
    .select()
    .from(schema.reports)
    .orderBy(desc(schema.reports.createdAt))
    .limit(200)
    .all();

  // Vorgänger pro Report: chronologisch (älter → neuer) je Ticker
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-secondary-400 mt-1">
          {rows.length === 0 ? "Noch keine Reports vorhanden." : `${rows.length} Audit(s) gespeichert.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <GlassCard className="p-6 text-sm text-secondary-400">
          Starte deinen ersten Research-Run auf der <Link href="/" className="text-accent-400 underline">Startseite</Link>.
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const prevId = prevByReport.get(r.id);
            return (
              <li key={r.id}>
                <GlassCard className="p-4 flex items-center gap-4">
                  <Link href={`/reports/${r.id}`} className="font-mono text-lg text-accent-400 w-20 hover:underline">
                    {r.ticker}
                  </Link>
                  <Link href={`/reports/${r.id}`} className="flex-1 min-w-0 hover:opacity-80">
                    <div className="text-sm font-medium truncate">
                      {r.companyName || "—"}{" "}
                      <span className="text-secondary-500">· {r.researchDate}</span>
                    </div>
                    <div className="text-xs text-secondary-500 mt-0.5">
                      {r.category ?? "—"} · confidence {r.confidence ?? "—"}
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
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
