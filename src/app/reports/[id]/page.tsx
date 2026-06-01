import fs from "node:fs";
import React from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/storage/db";
import { ReportSchema } from "@/lib/schemas/report";
import { BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";
import { loadScoreHistory } from "@/lib/research/score-history";
import { ExportButtons } from "@/components/ExportButtons";
import { PinButton } from "@/components/PinButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tone(value: number | null | undefined, goodHigh = true): string {
  if (value == null) return "text-secondary-500";
  if (goodHigh) return value >= 0 ? "text-emerald-300" : "text-amber-300";
  return value <= 0 ? "text-emerald-300" : "text-amber-300";
}

function fmt(value: number | null | undefined, mode: "pct" | "num" = "num"): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (mode === "pct") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

function sparkline(values: Array<number | null>, height = 44): JSX.Element {
  const pts = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (pts.length < 2) {
    return <div className="text-xs text-secondary-500">-</div>;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = Math.max(max - min, 1e-9);
  const width = 240;
  const path = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-300" />
    </svg>
  );
}

export default function ReportTerminalPage({
  params,
}: {
  params: { id: string };
}) {
  const row = db.select().from(schema.reports).where(eq(schema.reports.id, params.id)).get();
  if (!row) notFound();

  const jsonPath = row.reportJsonPath;
  if (!jsonPath || !fs.existsSync(jsonPath)) notFound();

  const report = ReportSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
  const history = loadScoreHistory(report.ticker, 12);
  const pinned = !!db.select().from(schema.watchlist).where(eq(schema.watchlist.ticker, row.ticker)).get();

  const blockValues = Object.entries(report.score_breakdown) as Array<[BlockKey, number]>;
  const scoreSeries = history.map((h) => h.scoreTotal ?? null);

  const market = report.market_context;
  const ts = report.trade_setup;

  return (
    <main className="mx-auto max-w-[1500px] space-y-2 px-3 py-3 font-mono text-[12px] leading-snug">
      {report.run_integrity.incomplete_due_to_technical_fetch_errors && (
        <div className="border border-red-700/50 bg-red-950/20 px-2 py-1 text-red-200">
          {report.run_integrity.banner || "Lauf unvollstandig - technischer Abruf-Fehler, bitte erneut ausfuhren."}
        </div>
      )}

      <section className="grid grid-cols-1 gap-2 border border-secondary-800 bg-secondary-950/60 px-2 py-1 xl:grid-cols-[1.6fr_1fr_1fr]">
        <div className="truncate">
          {report.ticker} · {report.company_name || "-"} · {report.exchange || "-"} · Kurs {fmt(report.fair_value?.current_price)} {report.fair_value?.currency || ""} · MA200-Abst. {fmt(report.technicals?.priceVsMa200Pct, "pct")}
        </div>
        <div className="truncate">Score {fmt(report.growth_research_score)} · Gate {report.gate} · Conf {report.confidence} · Linse {report.lens}</div>
        <div className="truncate">Aktion {ts.action} · Einstieg &lt;= {fmt(ts.entry_zone_max)} · R/R {fmt(ts.risk_reward)}</div>
      </section>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        <div className="space-y-1 border border-secondary-800 bg-secondary-950/40 p-2" data-testid="trade-setup-panel">
          <div className="uppercase tracking-wide text-secondary-400">Trade Setup</div>
          <div>Kurs: {fmt(report.fair_value?.current_price)} {report.fair_value?.currency || ""}</div>
          <div>Fair Value Mid: {fmt(report.fair_value?.point_estimate)}</div>
          <div>Einstiegszone &lt;= {fmt(ts.entry_zone_max)}</div>
          <div>Stop-Referenz: {fmt(ts.stop_ref)}</div>
          <div>Chance/Risiko: {fmt(ts.risk_reward)}</div>
          <div>MoS: {fmt(ts.margin_of_safety, "pct")}</div>
          <div>Aktion: {ts.action}</div>
          <div>Sizing: {ts.sizing_hint}</div>
          <div className={ts.computable ? "text-emerald-300" : "text-amber-300"}>{ts.computable ? "berechnet" : "nicht berechenbar"}</div>
        </div>

        <div className="space-y-1 border border-secondary-800 bg-secondary-950/40 p-2" data-testid="verdict-panel">
          <div className="uppercase tracking-wide text-secondary-400">Verdikt</div>
          <div>{report.verdict?.label || "-"}</div>
          <div>Gate {report.gate} · Score {fmt(report.growth_research_score)}</div>
          {blockValues.map(([k, v]) => {
            const max = BLOCK_WEIGHTS[k] ?? 1;
            const pct = Math.max(0, Math.min(100, (v / max) * 100));
            return (
              <div key={k} className="grid grid-cols-[170px_1fr_56px] items-center gap-1">
                <span className="truncate">{k}</span>
                <span className="relative h-1 bg-secondary-900">
                  <span className="absolute left-0 top-0 h-1 bg-accent-400" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-right">{v.toFixed(1)}</span>
              </div>
            );
          })}
        </div>

        <div className="space-y-1 border border-secondary-800 bg-secondary-950/40 p-2" data-testid="market-regime-panel">
          <div className="uppercase tracking-wide text-secondary-400">Markt Regime</div>
          <div>Regime: {market?.regime ?? report.regime ?? "-"}</div>
          <div>Breadth: {fmt(market?.breadth_pct_above_ma200, "pct")}</div>
          <div>VIX: {fmt(market?.vix)}</div>
          <div>HY Spread: {fmt(market?.high_yield_spread, "pct")}</div>
          <div>Zinskurve 10Y2Y: {fmt(market?.yield_curve_10y2y, "pct")}</div>
        </div>
      </section>

      <section className="space-y-2 border border-secondary-800 bg-secondary-950/40 p-2" data-testid="metrics-panel">
        <div className="uppercase tracking-wide text-secondary-400">Kennzahlen</div>
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-4">
          <div className="space-y-1">
            <div className="text-secondary-300">Wachstum</div>
            <div><span className="mr-2">*</span>Revenue YoY <span className={tone(report.key_metrics.revenue_growth_yoy)}>{fmt(report.key_metrics.revenue_growth_yoy, "pct")}</span></div>
            <div><span className="mr-2">*</span>CAGR 3Y <span className={tone(report.key_metrics.revenue_cagr_3y)}>{fmt(report.key_metrics.revenue_cagr_3y, "pct")}</span></div>
          </div>
          <div className="space-y-1">
            <div className="text-secondary-300">Rentabilitat</div>
            <div><span className="mr-2">*</span>ROIC <span className={tone(report.key_metrics.roic)}>{fmt(report.key_metrics.roic, "pct")}</span></div>
            <div><span className="mr-2">*</span>FCF Margin <span className={tone(report.key_metrics.fcf_margin)}>{fmt(report.key_metrics.fcf_margin, "pct")}</span></div>
            <div><span className="mr-2">*</span>Operating Margin <span className={tone(report.key_metrics.operating_margin)}>{fmt(report.key_metrics.operating_margin, "pct")}</span></div>
          </div>
          <div className="space-y-1">
            <div className="text-secondary-300">Bewertung</div>
            <div><span className="mr-2">*</span>EV/Sales <span className={tone(report.key_metrics.ev_sales, false)}>{fmt(report.key_metrics.ev_sales)}</span></div>
            <div><span className="mr-2">*</span>NTM PE <span className={tone(report.key_metrics.ntm_pe, false)}>{fmt(report.key_metrics.ntm_pe)}</span></div>
            <div><span className="mr-2">*</span>PEG <span className={tone(report.key_metrics.peg, false)}>{fmt(report.key_metrics.peg)}</span></div>
          </div>
          <div className="space-y-1">
            <div className="text-secondary-300">Bilanz & Forensik</div>
            <div><span className="mr-2">*</span>Net Debt/EBITDA <span className={tone(report.key_metrics.net_debt_to_ebitda, false)}>{fmt(report.key_metrics.net_debt_to_ebitda)}</span></div>
            <div><span className="mr-2">*</span>Altman Z <span className={tone(report.key_metrics.altman_z)}>{fmt(report.key_metrics.altman_z)}</span></div>
            <div><span className="mr-2">*</span>Piotroski F <span className={tone(report.key_metrics.piotroski_f)}>{fmt(report.key_metrics.piotroski_f)}</span></div>
          </div>
        </div>
        <div className="border-t border-secondary-800 pt-1" data-testid="momentum-row">
          Momentum/Sentiment · RSI {fmt(report.technicals?.rsi14)} · MACD {fmt(report.technicals?.macd.histogram)} · MA200-Abst. {fmt(report.technicals?.priceVsMa200Pct, "pct")} · RS6M {fmt(report.technicals?.relativeStrength.vsIndex6m, "pct")} · Beta {fmt(report.technicals?.beta)} · Revisions {fmt(report.inflection_flags?.revisionMomentumPositive ? 1 : 0)} · Beat-Serie {fmt(report.key_metrics.earnings_surprise_pct, "pct")} · SUE {fmt(report.expectations_gap === "market_underexpecting" ? 1 : 0)}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-3" data-testid="charts-row">
        <div className="border border-secondary-800 bg-secondary-950/40 p-2">
          <div className="uppercase tracking-wide text-secondary-400">Umsatz/EBIT/FCF 10J</div>
          {sparkline([
            report.key_metrics.revenue_cagr_3y,
            report.key_metrics.operating_margin,
            report.key_metrics.fcf_margin,
            report.key_metrics.roic,
          ])}
        </div>
        <div className="border border-secondary-800 bg-secondary-950/40 p-2">
          <div className="uppercase tracking-wide text-secondary-400">Kurs vs Fair Value Band</div>
          {sparkline([
            report.fair_value?.range_low ?? null,
            report.fair_value?.point_estimate ?? null,
            report.fair_value?.range_high ?? null,
            report.fair_value?.current_price ?? null,
          ])}
        </div>
        <div className="border border-secondary-800 bg-secondary-950/40 p-2">
          <div className="uppercase tracking-wide text-secondary-400">Score Trend</div>
          {sparkline(scoreSeries)}
        </div>
      </section>

      <section className="space-y-1 border border-secondary-800 bg-secondary-950/40 p-2" data-testid="ownership-panel">
        <div className="uppercase tracking-wide text-secondary-400">Ownership & Smart Money</div>
        <div className="flex flex-wrap gap-2">
          <span className="border border-secondary-700 px-2 py-0.5">Cluster-Buy {report.ownership_score != null && report.ownership_score >= 7 ? "ja" : "-"}</span>
          <span className="border border-secondary-700 px-2 py-0.5">Insider netto {fmt(report.key_metrics.insider_net_activity_usd)}</span>
          <span className="border border-secondary-700 px-2 py-0.5">Institutionell {report.metric_applicability["ownership.institutionalTrend"] ? "Trend" : "-"}</span>
          <span className="border border-secondary-700 px-2 py-0.5">Short {fmt(report.key_metrics.net_debt_to_ebitda)}</span>
          <span className="border border-secondary-700 px-2 py-0.5">Buyback/Verwasserung {fmt(report.key_metrics.share_count_growth_yoy, "pct")}</span>
        </div>
      </section>

      <section className="space-y-1 border border-amber-700/40 bg-amber-950/10 p-2" data-testid="analyst-panel">
        <div className="flex items-center justify-between">
          <div className="uppercase tracking-wide text-amber-300">KI Analyst Beraterebene</div>
          <div className="text-[11px] text-amber-200">Levels berechnet · Text interpretiert · nicht im Score</div>
        </div>
        {report.analyst ? (
          <>
            <div><span className="text-secondary-400">These:</span> {report.analyst.thesis || "-"}</div>
            <div><span className="text-secondary-400">Was die Zahlen sagen:</span> {report.analyst.numbersSay || "-"}</div>
            <div><span className="text-emerald-300">Bull:</span> {report.analyst.bullCase || "-"}</div>
            <div><span className="text-rose-300">Bear:</span> {report.analyst.bearCase || "-"}</div>
            <div><span className="text-secondary-400">Katalysator:</span> {report.analyst.catalystNote || report.analyst.catalysts[0]?.text || "-"}</div>
            {report.analyst.catalysts[0] && (
              <div className="text-secondary-300">Quelle: {report.analyst.catalysts[0].sourceUrl || "-"} · {report.analyst.catalysts[0].sourceDate || "-"} · {report.analyst.catalysts[0].status}</div>
            )}
            <div className="text-emerald-300">Einstieg-Trigger: {report.analyst.entryTrigger || "-"}</div>
            <div className="text-amber-300">Exit/Watch-Trigger: {report.analyst.exitWatchTrigger || "-"}</div>
          </>
        ) : (
          <div className="text-amber-200">nicht verfugbar</div>
        )}
      </section>

      <section className="border border-secondary-800 bg-secondary-950/40 p-2">
        <div className="flex items-center justify-between">
          <div className="uppercase tracking-wide text-secondary-400">Quellen ({report.source_list.length})</div>
          <div className="flex items-center gap-2">
            <ExportButtons reportId={params.id} ticker={report.ticker} />
            <PinButton ticker={report.ticker} reportId={params.id} initiallyPinned={pinned} />
          </div>
        </div>
        <div className="mt-1 grid max-h-[220px] grid-cols-1 gap-x-4 gap-y-0.5 overflow-auto xl:grid-cols-2">
          {report.source_list.map((s) => (
            <div key={`${s.idx}-${s.url}`} className="truncate text-secondary-300">
              [{s.idx}] ({s.class}) {s.url}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
