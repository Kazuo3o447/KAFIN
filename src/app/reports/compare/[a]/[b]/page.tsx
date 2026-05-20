/**
 * Compare-Page – vergleicht zwei Reports desselben Tickers.
 * Konvention: a = älter, b = neuer. Wenn umgekehrt geliefert, tauschen wir.
 */
import fs from "node:fs";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { ReportSchema } from "@/lib/schemas/report";
import { GlassCard } from "@/components/GlassCard";
import { diffReports } from "@/lib/diff/report-diff";
import { BLOCK_LABELS } from "@/lib/scoring/weights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GATE_BADGE: Record<string, string> = {
  Green: "bg-green-700/20 text-green-300 border-green-700/40",
  Yellow: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  Red: "bg-red-700/20 text-red-300 border-red-700/40",
};

function loadReport(id: string) {
  const row = db.select().from(schema.reports).where(eq(schema.reports.id, id)).get();
  if (!row || !row.reportJsonPath || !fs.existsSync(row.reportJsonPath)) return null;
  const raw = fs.readFileSync(row.reportJsonPath, "utf8");
  const report = ReportSchema.parse(JSON.parse(raw));
  return { id: row.id, ticker: row.ticker, createdAt: row.createdAt, report };
}

function fmtDelta(delta: number, digits = 1): string {
  if (delta === 0) return "±0";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(digits)}`;
}

function fmtMetric(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) < 1) return v.toFixed(3);
  return v.toFixed(2);
}

function deltaClass(delta: number | null): string {
  if (delta === null) return "text-secondary-500";
  if (delta > 0.001) return "text-green-400";
  if (delta < -0.001) return "text-red-400";
  return "text-secondary-400";
}

export default function ComparePage({ params }: { params: { a: string; b: string } }) {
  const ra = loadReport(params.a);
  const rb = loadReport(params.b);
  if (!ra || !rb) notFound();
  if (ra.ticker.toUpperCase() !== rb.ticker.toUpperCase()) notFound();

  // sicherstellen: a = älter, b = neuer
  const [older, newer] = ra.createdAt <= rb.createdAt ? [ra, rb] : [rb, ra];
  const diff = diffReports(
    { id: older.id, report: older.report },
    { id: newer.id, report: newer.report },
  );
  const m = diff.meta;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono text-accent-400">{m.ticker}</span> · Versionsvergleich
          </h1>
          <span className="text-sm text-secondary-500">
            {m.a.date} → {m.b.date}
          </span>
        </div>
        <p className="text-sm text-secondary-400 mt-1">
          <Link href={`/reports/${m.a.id}`} className="underline hover:text-accent-400">
            Vorgänger-Report
          </Link>{" "}
          ·{" "}
          <Link href={`/reports/${m.b.id}`} className="underline hover:text-accent-400">
            Aktueller Report
          </Link>
        </p>
      </header>

      {/* Score-Δ + Gate/Category */}
      <GlassCard className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs uppercase text-secondary-500">Score</div>
            <div className="text-3xl font-semibold">
              {m.a.score} <span className="text-secondary-500">→</span> {m.b.score}
            </div>
            <div className={`text-sm font-mono ${deltaClass(m.scoreDelta)}`}>
              Δ {fmtDelta(m.scoreDelta, 1)} Pkt
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-secondary-500">Gate</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs uppercase px-2 py-1 rounded border ${GATE_BADGE[m.a.gate] ?? ""}`}>
                {m.a.gate}
              </span>
              <span className="text-secondary-500">→</span>
              <span className={`text-xs uppercase px-2 py-1 rounded border ${GATE_BADGE[m.b.gate] ?? ""}`}>
                {m.b.gate}
              </span>
            </div>
            {m.gateChanged ? (
              <div className="text-xs text-amber-400 mt-1">geändert</div>
            ) : (
              <div className="text-xs text-secondary-500 mt-1">unverändert</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-secondary-500">Kategorie</div>
            <div className="text-sm text-secondary-200 mt-1">
              {m.a.category} <span className="text-secondary-500">→</span> {m.b.category}
            </div>
            {m.categoryChanged ? (
              <div className="text-xs text-amber-400 mt-1">geändert</div>
            ) : (
              <div className="text-xs text-secondary-500 mt-1">unverändert</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-secondary-500">Confidence</div>
            <div className="text-sm text-secondary-200 mt-1">
              {m.a.confidence} <span className="text-secondary-500">→</span> {m.b.confidence}
            </div>
            {m.confidenceChanged ? (
              <div className="text-xs text-amber-400 mt-1">geändert</div>
            ) : (
              <div className="text-xs text-secondary-500 mt-1">unverändert</div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Block-Δ */}
      <GlassCard className="p-5">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">7-Block-Δ</h2>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-secondary-500">
            <tr className="border-b border-secondary-800">
              <th className="text-left py-2">Block</th>
              <th className="text-right py-2">Vorher</th>
              <th className="text-right py-2">Nachher</th>
              <th className="text-right py-2">Δ</th>
              <th className="text-right py-2">Max</th>
            </tr>
          </thead>
          <tbody>
            {diff.blocks.map((b) => (
              <tr key={b.block} className="border-b border-secondary-900">
                <td className="py-2 text-secondary-200">{BLOCK_LABELS[b.block]}</td>
                <td className="py-2 text-right font-mono">{b.before.toFixed(1)}</td>
                <td className="py-2 text-right font-mono">{b.after.toFixed(1)}</td>
                <td className={`py-2 text-right font-mono ${deltaClass(b.delta)}`}>
                  {fmtDelta(b.delta, 2)}
                </td>
                <td className="py-2 text-right text-secondary-500 font-mono">{b.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Indikator-Δ */}
      {diff.indicators.length > 0 ? (
        <GlassCard className="p-5">
          <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">
            Indikator-Änderungen · {diff.indicators.length}
          </h2>
          <ul className="divide-y divide-secondary-800/60">
            {diff.indicators.slice(0, 30).map((ind, i) => (
              <li key={`${ind.block}-${ind.name}-${i}`} className="py-2 flex gap-3 text-sm">
                <div className="w-16 shrink-0 text-right">
                  <span className={`font-mono ${deltaClass(ind.delta)}`}>
                    {ind.delta === null ? "—" : fmtDelta(ind.delta, 1)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-secondary-100">
                    <span className="text-xs text-secondary-500 mr-2">
                      {BLOCK_LABELS[ind.block]}
                    </span>
                    {ind.name}
                  </div>
                  <div className="text-xs text-secondary-500 font-mono">
                    {ind.before === null ? "—" : ind.before.toFixed(1)} →{" "}
                    {ind.after === null ? "—" : ind.after.toFixed(1)}
                    {ind.rationaleChanged ? (
                      <span className="ml-2 text-amber-400">· Rationale geändert</span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {diff.indicators.length > 30 ? (
            <p className="text-xs text-secondary-500 mt-2">
              … {diff.indicators.length - 30} weitere Änderungen ausgeblendet.
            </p>
          ) : null}
        </GlassCard>
      ) : null}

      {/* Key-Metrics */}
      <GlassCard className="p-5">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">Key-Metrics</h2>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-secondary-500">
            <tr className="border-b border-secondary-800">
              <th className="text-left py-2">Metrik</th>
              <th className="text-right py-2">Vorher</th>
              <th className="text-right py-2">Nachher</th>
              <th className="text-right py-2">Δ</th>
              <th className="text-right py-2">% Δ</th>
            </tr>
          </thead>
          <tbody>
            {diff.keyMetrics.map((k) => (
              <tr key={k.key} className="border-b border-secondary-900">
                <td className="py-1.5 text-secondary-200 font-mono text-xs">{k.key}</td>
                <td className="py-1.5 text-right font-mono">{fmtMetric(k.before)}</td>
                <td className="py-1.5 text-right font-mono">{fmtMetric(k.after)}</td>
                <td className={`py-1.5 text-right font-mono ${deltaClass(k.delta)}`}>
                  {k.delta === null ? "—" : fmtDelta(k.delta, 3)}
                </td>
                <td className={`py-1.5 text-right font-mono ${deltaClass(k.pctDelta)}`}>
                  {k.pctDelta === null ? "—" : `${(k.pctDelta * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Listen-Δ */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListDeltaCard title="Bull Case" delta={diff.bullCase} />
        <ListDeltaCard title="Bear Case" delta={diff.bearCase} />
        <ListDeltaCard title="Katalysatoren" delta={diff.catalysts} />
        <ListDeltaCard title="Hard Blockers" delta={diff.hardBlockers} variant="red" />
        <ListDeltaCard title="Red Flags" delta={diff.redFlags} variant="red" />
        <ListDeltaCard title="Offene Fragen" delta={diff.openQuestions} />
      </section>

      {/* Thesis */}
      <GlassCard className="p-5">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">
          These {diff.thesisSummary.changed ? <span className="text-amber-400 normal-case">· geändert</span> : null}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-secondary-500 mb-1">Vorher · {m.a.date}</div>
            <p className="text-secondary-300 leading-relaxed">{diff.thesisSummary.before || "—"}</p>
          </div>
          <div>
            <div className="text-xs uppercase text-secondary-500 mb-1">Nachher · {m.b.date}</div>
            <p className="text-secondary-200 leading-relaxed">{diff.thesisSummary.after || "—"}</p>
          </div>
        </div>
      </GlassCard>
    </main>
  );
}

function ListDeltaCard({
  title,
  delta,
  variant,
}: {
  title: string;
  delta: { added: string[]; removed: string[]; unchanged: string[] };
  variant?: "red";
}) {
  const total = delta.added.length + delta.removed.length;
  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm uppercase tracking-wide text-secondary-500">{title}</h3>
        <span className="text-xs text-secondary-500">
          +{delta.added.length} / −{delta.removed.length}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-secondary-500">unverändert ({delta.unchanged.length})</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {delta.added.map((v, i) => (
            <li key={`a-${i}`} className={variant === "red" ? "text-red-300" : "text-green-300"}>
              + {v}
            </li>
          ))}
          {delta.removed.map((v, i) => (
            <li key={`r-${i}`} className="text-secondary-500 line-through">
              − {v}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
