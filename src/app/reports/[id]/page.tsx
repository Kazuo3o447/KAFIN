import fs from "node:fs";
import React from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/storage/db";
import { ReportSchema } from "@/lib/schemas/report";
import { loadScoreHistory } from "@/lib/research/score-history";
import { ExportButtons } from "@/components/ExportButtons";
import { PinButton } from "@/components/PinButton";
import { FairValuePanel } from "@/components/FairValuePanel";
import { AxesScorecardCard } from "@/components/AxesScorecardCard";
import { FinancialsChart } from "@/components/charts/FinancialsChart";
import { ScoreTrendChart } from "@/components/charts/ScoreTrendChart";
import { ChatPanel } from "@/components/ChatPanel";

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

  const market = report.market_context;
  const ts = report.trade_setup;
  const km = report.key_metrics;

  // PEG-Label je Fallback-Stufe
  const pegLabel = (() => {
    const lvl = km.peg_fallback_level;
    if (lvl === 1) return `PEG ${fmt(km.peg)}`;
    if (lvl === 2) return `EV/EBIT-G ${fmt(km.ev_ebit_to_growth)}`;
    if (lvl === 3) return `EV/GP ${fmt(km.ev_gross_profit)}`;
    if (lvl === 4) return `PSG ${fmt(km.ev_sales_to_growth)}`;
    return `PEG ${fmt(km.peg)}`;
  })();

  // Short Interest (korrekt — §1 bugfix)
  const shortPctStr = km.short_interest_pct_float !== null && km.short_interest_pct_float !== undefined
    ? `${(km.short_interest_pct_float * 100).toFixed(1)}%`
    : "-";
  const dtcStr = km.days_to_cover !== null && km.days_to_cover !== undefined
    ? `${km.days_to_cover.toFixed(1)}d`
    : "-";

  return (
    <main className="mx-auto max-w-[1500px] space-y-2 px-3 py-3 font-mono text-[12px] leading-snug">
      {report.run_integrity.incomplete_due_to_technical_fetch_errors && (
        <div className="border border-red-700/50 bg-red-950/20 px-2 py-1 text-red-200">
          {report.run_integrity.banner || "Lauf unvollständig – technischer Abruf-Fehler."}
        </div>
      )}

      {/* ================================================================
          ZONE 1 · HERO (Entscheidung)
          ================================================================ */}
      <section
        className="grid grid-cols-1 gap-2 border border-secondary-800 bg-secondary-950/60 p-2 xl:grid-cols-[2fr_1fr_1fr]"
        data-testid="hero-panel"
      >
        <div className="space-y-0.5">
          <div className="text-base font-semibold text-secondary-100 truncate">
            {report.ticker} · {report.company_name || "-"}
          </div>
          <div className="text-secondary-400 truncate">
            {report.exchange || "-"} · Kurs {fmt(report.fair_value?.current_price)}{" "}
            {report.fair_value?.currency || ""} · MA200-Abst.{" "}
            {fmt(report.technicals?.priceVsMa200Pct, "pct")}
          </div>
          {report.analyst?.thesis && (
            <div className="text-secondary-300 italic mt-1 line-clamp-2">{report.analyst.thesis}</div>
          )}
        </div>
        <div className="space-y-0.5" data-testid="trade-setup-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px]">Aktion</div>
          <div className="text-lg font-bold text-accent-300">{ts.action}</div>
          <div className="text-secondary-300">
            Einstieg ≤ {fmt(ts.entry_zone_max)} · R/R {fmt(ts.risk_reward)} · MoS{" "}
            {fmt(ts.margin_of_safety, "pct")}
          </div>
          <div className="text-secondary-400">
            Stop {fmt(ts.stop_ref)} · {ts.sizing_hint}
          </div>
          {!ts.computable && (
            <div className="text-amber-300 text-[11px]">nicht berechenbar</div>
          )}
        </div>
        <div className="space-y-0.5">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px]">Score &amp; Gate</div>
          <div className="font-mono text-secondary-100">
            {fmt(report.growth_research_score)} / 100 · {report.gate} · {report.confidence}
          </div>
          <div className="text-secondary-400 text-[11px]">
            Linse {report.lens} · {report.category}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <PinButton ticker={report.ticker} reportId={params.id} initiallyPinned={pinned} />
            <ExportButtons reportId={params.id} ticker={report.ticker} />
          </div>
        </div>
      </section>

      {/* ================================================================
          ZONE 2 · SCORECARD (3 Achsen + Safety-Gate)
          ================================================================ */}
      <section
        className="border border-secondary-800 bg-secondary-950/40 p-2"
        data-testid="scorecard-panel"
      >
        <AxesScorecardCard
          axes={report.axes}
          safetyGate={report.safety_gate}
          archetype={report.category}
        />
      </section>

      {/* ================================================================
          ZONE 3 · FAIR-VALUE-BRÜCKE
          ================================================================ */}
      <section
        className="border border-secondary-800 bg-secondary-950/40 p-2"
        data-testid="fair-value-panel"
      >
        <FairValuePanel fairValue={report.fair_value} />
      </section>

      {/* ================================================================
          ZONE 4 · EVIDENZ (Kennzahlen, Charts, KI-Urteil, Forensik)
          ================================================================ */}
      <section className="space-y-2" data-testid="evidence-section">

        {/* 4a: Kennzahlen */}
        <div className="border border-secondary-800 bg-secondary-950/40 p-2" data-testid="metrics-panel">
          <div className="uppercase tracking-wide text-secondary-400 mb-1 text-[11px]">Kennzahlen</div>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-4">
            <div className="space-y-0.5">
              <div className="text-secondary-300 text-[11px]">Wachstum</div>
              <div>Revenue YoY <span className={tone(km.revenue_growth_yoy)}>{fmt(km.revenue_growth_yoy, "pct")}</span></div>
              <div>CAGR 3Y <span className={tone(km.revenue_cagr_3y)}>{fmt(km.revenue_cagr_3y, "pct")}</span></div>
              <div>EPS CAGR fwd <span className={tone(km.revenue_growth_ttm)}>{fmt(km.revenue_growth_ttm, "pct")}</span></div>
            </div>
            <div className="space-y-0.5">
              <div className="text-secondary-300 text-[11px]">Rentabilität</div>
              <div>ROIC <span className={tone(km.roic)}>{fmt(km.roic, "pct")}</span></div>
              <div>FCF Margin <span className={tone(km.fcf_margin)}>{fmt(km.fcf_margin, "pct")}</span></div>
              <div>Oper. Margin <span className={tone(km.operating_margin)}>{fmt(km.operating_margin, "pct")}</span></div>
              <div>Rule of 40 <span className={tone(km.rule_of_40)}>{fmt(km.rule_of_40)}</span></div>
            </div>
            <div className="space-y-0.5">
              <div className="text-secondary-300 text-[11px]">Bewertung</div>
              <div>EV/Sales <span className={tone(km.ev_sales, false)}>{fmt(km.ev_sales)}</span></div>
              <div>NTM PE <span className={tone(km.ntm_pe, false)}>{fmt(km.ntm_pe)}</span></div>
              <div>
                <span className="text-secondary-400 text-[10px] mr-1">
                  {km.peg_fallback_level !== null ? `L${km.peg_fallback_level ?? ""}` : ""}
                </span>
                <span className={tone(km.peg, false)}>{pegLabel}</span>
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-secondary-300 text-[11px]">Bilanz &amp; Forensik</div>
              <div>Net Debt/EBITDA <span className={tone(km.net_debt_to_ebitda, false)}>{fmt(km.net_debt_to_ebitda)}</span></div>
              <div>Altman Z <span className={tone(km.altman_z)}>{fmt(km.altman_z)}</span></div>
              <div>Piotroski F <span className={tone(km.piotroski_f)}>{fmt(km.piotroski_f)}</span></div>
              <div>Beneish M <span className={tone(km.beneish_m, false)}>{fmt(km.beneish_m)}</span></div>
            </div>
          </div>
        </div>

        {/* 4b: Charts */}
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2" data-testid="charts-row">
          <div className="border border-secondary-800 bg-secondary-950/40 p-2">
            <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Umsatz / EBIT / FCF (jährl.)</div>
            <FinancialsChart data={report.chart_data.financials_annual} />
          </div>
          <div className="border border-secondary-800 bg-secondary-950/40 p-2">
            <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Score-Trend</div>
            <ScoreTrendChart data={history} />
          </div>
        </div>

        {/* 4c: KI-Urteil */}
        <div className="border border-amber-700/40 bg-amber-950/10 p-2" data-testid="analyst-panel">
          <div className="flex items-center justify-between mb-1">
            <div className="uppercase tracking-wide text-amber-300 text-[11px]">KI Analyst Beraterebene</div>
            <div className="text-[10px] text-amber-200">Levels berechnet · Text interpretiert · nicht im Score</div>
          </div>
          {report.analyst ? (
            <div className="space-y-0.5">
              <div><span className="text-secondary-400">These:</span> {report.analyst.thesis || "-"}</div>
              <div><span className="text-secondary-400">Zahlen:</span> {report.analyst.numbersSay || "-"}</div>
              <div><span className="text-emerald-300">Bull:</span> {report.analyst.bullCase || "-"}</div>
              <div><span className="text-rose-300">Bear:</span> {report.analyst.bearCase || "-"}</div>
              <div><span className="text-secondary-400">Katalysator:</span> {report.analyst.catalystNote || report.analyst.catalysts[0]?.text || "-"}</div>
              <div className="text-emerald-300">Einstieg-Trigger: {report.analyst.entryTrigger || "-"}</div>
              <div className="text-amber-300">Exit-Trigger: {report.analyst.exitWatchTrigger || "-"}</div>
            </div>
          ) : (
            <div className="text-amber-200">nicht verfügbar</div>
          )}
        </div>
      </section>

      {/* ================================================================
          ZONE 4d · KI-CHAT
          ================================================================ */}
      <ChatPanel reportId={params.id} ticker={report.ticker} />

      {/* ================================================================
          ZONE 5 · KONTEXT (Regime, Ownership, Momentum)
          ================================================================ */}
      <section className="grid grid-cols-1 gap-2 xl:grid-cols-3" data-testid="context-section">

        {/* 5a: Marktregime */}
        <div className="border border-secondary-800 bg-secondary-950/40 p-2" data-testid="market-regime-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Markt Regime</div>
          <div>Regime: {market?.regime ?? report.regime ?? "-"}</div>
          <div>Breadth: {fmt(market?.breadth_pct_above_ma200, "pct")}</div>
          <div>VIX: {fmt(market?.vix)}</div>
          <div>HY Spread: {fmt(market?.high_yield_spread, "pct")}</div>
          <div>Zinskurve 10Y2Y: {fmt(market?.yield_curve_10y2y, "pct")}</div>
          {report.timing_score !== null && (
            <div>Timing Score: {fmt(report.timing_score)}</div>
          )}
        </div>

        {/* 5b: Ownership */}
        <div className="border border-secondary-800 bg-secondary-950/40 p-2" data-testid="ownership-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Ownership &amp; Smart Money</div>
          <div className="flex flex-wrap gap-1.5">
            <span className="border border-secondary-700 px-1.5 py-0.5">
              Short {shortPctStr} ({dtcStr})
            </span>
            <span className="border border-secondary-700 px-1.5 py-0.5">
              Insider netto {fmt(km.insider_net_activity_usd)}
            </span>
            <span className="border border-secondary-700 px-1.5 py-0.5">
              Verdünnung {fmt(km.share_count_growth_yoy, "pct")}
            </span>
            <span className="border border-secondary-700 px-1.5 py-0.5">
              Buyback-Score {report.ownership_score !== null ? fmt(report.ownership_score) : "-"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-secondary-400">
            Analyst ↑ {km.analyst_upgrades_3m ?? "-"} ↓ {km.analyst_downgrades_3m ?? "-"} (3M)
          </div>
        </div>

        {/* 5c: Momentum-Chips */}
        <div className="border border-secondary-800 bg-secondary-950/40 p-2" data-testid="momentum-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Momentum</div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "RSI", value: fmt(report.technicals?.rsi14) },
              { label: "MACD-H", value: fmt(report.technicals?.macd.histogram) },
              { label: "MA200Δ", value: fmt(report.technicals?.priceVsMa200Pct, "pct") },
              { label: "RS6M", value: fmt(report.technicals?.relativeStrength.vsIndex6m, "pct") },
              { label: "Beta", value: fmt(report.technicals?.beta) },
              { label: "Beat%", value: fmt(km.earnings_surprise_pct, "pct") },
            ].map(({ label, value }) => (
              <span key={label} className="border border-secondary-700 px-1.5 py-0.5 text-[11px]">
                {label} {value}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Quellen */}
      <section className="border border-secondary-800 bg-secondary-950/40 p-2">
        <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">
          Quellen ({report.source_list.length})
        </div>
        <div className="grid max-h-[220px] grid-cols-1 gap-x-4 gap-y-0.5 overflow-auto xl:grid-cols-2">
          {report.source_list.map((s) => (
            <div key={`${s.idx}-${s.url}`} className="truncate text-secondary-300 text-[11px]">
              [{s.idx}] ({s.class}) {s.url}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

