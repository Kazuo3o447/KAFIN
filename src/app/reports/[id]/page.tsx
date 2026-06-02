import fs from "node:fs";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/storage/db";
import { ReportSchema } from "@/lib/schemas/report";
import { loadScoreHistory } from "@/lib/research/score-history";
import { ExportButtons } from "@/components/ExportButtons";
import { PinButton } from "@/components/PinButton";
import { FairValuePanel } from "@/components/FairValuePanel";
import { ReportScorecardRadar } from "@/components/ReportScorecardRadar";
import { FinancialsChart } from "@/components/charts/FinancialsChart";
import { ScoreTrendChart } from "@/components/charts/ScoreTrendChart";
import { ChatPanel } from "@/components/ChatPanel";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { RedTeamPanel } from "@/components/RedTeamPanel";
import { SourceList } from "@/components/SourceList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmt(value: number | null | undefined, mode: "pct" | "num" = "num", digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (mode === "pct") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(digits);
}

function fmtSignedPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const v = (value * 100).toFixed(1);
  return `${value >= 0 ? "+" : ""}${v}%`;
}

function toneByBands(value: number | null | undefined, bands: { green: number; amber: number }, goodHigh = true, muted = false): string {
  if (value == null || !Number.isFinite(value)) return "text-secondary-500";
  const ok = goodHigh ? value >= bands.green : value <= bands.green;
  const warn = goodHigh ? value >= bands.amber : value <= bands.amber;
  if (ok) return muted ? "text-emerald-400/60" : "text-emerald-300";
  if (warn) return muted ? "text-amber-400/60" : "text-amber-300";
  return muted ? "text-rose-400/60" : "text-rose-300";
}

function arrow(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "·";
  if (value > 0) return "↑";
  if (value < 0) return "↓";
  return "→";
}

function spark(values: number[]): string {
  if (values.length === 0) return "n/a";
  if (values.length === 1) return "•";
  const glyphs = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return "▄▄▄▄";
  return values
    .map((v) => {
      const idx = Math.max(0, Math.min(glyphs.length - 1, Math.round(((v - min) / (max - min)) * (glyphs.length - 1))));
      return glyphs[idx] ?? "▄";
    })
    .join("");
}

function cleanAnnualSeries(raw: Array<Record<string, unknown>>): Array<{ year: string; revenue: number | null; grossProfit: number | null; ebit: number | null; fcf: number | null; grossMargin: number | null; operatingMargin: number | null; fcfMargin: number | null }> {
  const byYear = new Map<string, any>();
  for (const row of raw) {
    const year = typeof row.year === "string" ? row.year : null;
    if (!year) continue;
    const point = {
      year,
      revenue: typeof row.revenue === "number" ? row.revenue : null,
      grossProfit: typeof row.grossProfit === "number" ? row.grossProfit : null,
      ebit: typeof row.ebit === "number" ? row.ebit : null,
      fcf: typeof row.fcf === "number" ? row.fcf : null,
      grossMargin: typeof row.grossMargin === "number" ? row.grossMargin : null,
      operatingMargin: typeof row.operatingMargin === "number" ? row.operatingMargin : null,
      fcfMargin: typeof row.fcfMargin === "number" ? row.fcfMargin : null,
    };
    const hasData =
      point.revenue !== null ||
      point.grossProfit !== null ||
      point.ebit !== null ||
      point.fcf !== null ||
      point.grossMargin !== null ||
      point.operatingMargin !== null ||
      point.fcfMargin !== null;
    if (!hasData) continue;
    byYear.set(year, point);
  }
  return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
}

export default function ReportTerminalPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
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
  const scoreHeatmap = report.score_heatmap;
  const financialsAnnual = cleanAnnualSeries((report.chart_data?.financials_annual ?? []) as Array<Record<string, unknown>>);
  const focusMetric = typeof searchParams?.focusMetric === "string" ? searchParams.focusMetric : null;

  const revenueSeries = financialsAnnual.map((x) => x.revenue).filter((v): v is number => v !== null);
  const marginSeries = financialsAnnual.map((x) => x.fcfMargin).filter((v): v is number => v !== null);

  const debtConfidence = (report.debt_breakdown as Record<string, unknown> | null)?.confidence;
  const debtLowConfidence = debtConfidence === "low";

  // Short Interest (korrekt — §1 bugfix)
  const shortPctStr = km.short_interest_pct_float !== null && km.short_interest_pct_float !== undefined
    ? `${(km.short_interest_pct_float * 100).toFixed(1)}%`
    : "-";
  const dtcStr = km.days_to_cover !== null && km.days_to_cover !== undefined
    ? `${km.days_to_cover.toFixed(1)}d`
    : "-";

  const garpResult = report.lens_results.find((x) => (x as Record<string, unknown>).lens === "quality_garp") as Record<string, unknown> | undefined;
  const garpReroute = garpResult?.lensFit === false;

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 px-3 py-3 text-[12px] leading-snug">
      <div className="border border-secondary-800 bg-secondary-950/40 px-3 py-1.5 text-[11px] flex items-center justify-between" aria-live="polite">
        <div className="text-secondary-300">
          Markt-Posture: <span className="text-secondary-100">{market?.market_posture_label ?? market?.regime ?? "Marktkontext nicht verfügbar"}</span>
          {market?.market_posture_score !== null && market?.market_posture_score !== undefined && (
            <span className="text-secondary-400"> · Score {fmt(market.market_posture_score, "num", 0)}</span>
          )}
          <span className="text-secondary-500"> · as-of {market?.as_of || "n/a"}</span>
        </div>
        <Link href="/markets" className="text-accent-300 hover:underline">Markets öffnen</Link>
      </div>

      {report.run_integrity.incomplete_due_to_technical_fetch_errors && (
        <div className="border border-red-700/50 bg-red-950/20 px-2 py-1 text-red-200" aria-live="polite">
          {report.run_integrity.banner || "Lauf unvollständig – technischer Abruf-Fehler."} Nachholbar: {report.run_integrity.fetch_statuses.filter((s) => s.status === "fetch_failed" || s.status === "rate_limited" || s.status === "stale").map((s) => s.capability).join(", ") || "n/a"}
        </div>
      )}

      {report.trader_cockpit.critical_missing_data.length > 0 && (
        <div className="border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-amber-200">
          <div className="text-[11px] uppercase tracking-wide">Was fehlt & warum</div>
          <div className="mt-1 text-[12px]">{report.trader_cockpit.critical_missing_data.join(" · ")}</div>
        </div>
      )}

      {/* ================================================================
          ZONE 1 · HERO (Entscheidung)
          ================================================================ */}
      <section
        className="grid grid-cols-1 gap-3 border border-secondary-800 bg-secondary-950/60 p-3 xl:grid-cols-[2fr_1fr_1fr]"
        data-testid="hero-panel"
      >
        <div className="space-y-0.5">
          <div className="text-base font-semibold text-secondary-100 truncate font-mono">
            {report.ticker} · {report.company_name || "-"}
          </div>
          <div className="text-secondary-400 truncate">
            {report.exchange || "n/a"} · {report.sector || "n/a"} / {report.industry || "n/a"} · Kurs {fmt(report.fair_value?.current_price)}{" "}
            {report.fair_value?.currency || ""} · MA200-Abst.{" "}
            {fmt(report.technicals?.priceVsMa200Pct, "pct")}
          </div>
          <div className="text-secondary-300 mt-1">
            Thesis: {report.thesis_summary || report.analyst?.thesis || "n/a — KI-Thesis fehlt, Kennzahlenbasis nutzen"}
          </div>
          {garpReroute && (
            <div className="text-amber-300 text-[11px] mt-1">GARP-Mandat verfehlt → intern als emerging_winner bewertet.</div>
          )}
          {report.analyst?.thesis && (
            <div className="text-secondary-300 italic mt-1 line-clamp-2">{report.analyst.thesis}</div>
          )}
        </div>
        <div className="space-y-0.5" data-testid="trade-setup-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px]">Aktion</div>
          <div className="text-lg font-bold text-accent-300">
            {report.action_recommendation === "buy" ? "Kaufen" : report.action_recommendation === "watch" ? "Beobachten" : report.action_recommendation === "avoid" ? "Meiden" : "Daten unzureichend"}
          </div>
          <div className="text-secondary-300">
            Einstieg ≤ {fmt(ts.entry_zone_max)} · R/R {fmt(ts.risk_reward)} · MoS{" "}
            {fmt(ts.margin_of_safety, "pct")}
          </div>
          <div className="text-secondary-400">
            Stop {fmt(ts.stop_ref)} · Conviction {report.confidence_score !== null ? `${fmt(report.confidence_score, "num", 0)}/100` : "n/a"}
          </div>
          {!ts.computable && (
            <div className="text-amber-300 text-[11px]">nicht berechenbar — Trade-Inputs fehlen</div>
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
        <ReportScorecardRadar
          axes={report.axes}
          scoreHeatmap={scoreHeatmap as Array<Record<string, unknown>>}
          safetyGate={report.safety_gate}
          confidenceScore={report.confidence_score}
          dataQualityCoverage={report.data_quality.coverage.applicabilityAdjustedCoverage}
        />
      </section>

      {/* ================================================================
          ZONE 3 · DREI FARBKODIERTE KENNZAHLENBLÖCKE
          ================================================================ */}
      <section className="grid grid-cols-1 gap-2 xl:grid-cols-3" data-testid="metrics-color-blocks">
        <div className="border border-secondary-800 bg-secondary-950/40 p-2">
          <div className="text-[11px] uppercase tracking-wide text-secondary-400 mb-1">Wachstum · Coverage {(report.data_quality.coverage.indicatorScoreCoverage * 100).toFixed(0)}%</div>
          <div className="space-y-1 text-[12px]">
            <a href={`?focusMetric=revenue_growth_yoy#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5">
              <span>Revenue YoY {arrow(km.revenue_growth_yoy)}</span>
              <span className={toneByBands(km.revenue_growth_yoy, { green: 0.15, amber: 0.06 }, true)}>{fmt(km.revenue_growth_yoy, "pct")} · {spark(revenueSeries)}</span>
            </a>
            <a href={`?focusMetric=revenue_cagr_3y#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Rev CAGR 3J</span><span className={toneByBands(km.revenue_cagr_3y, { green: 0.12, amber: 0.06 }, true)}>{fmt(km.revenue_cagr_3y, "pct")}</span></a>
            <a href={`?focusMetric=revenue_growth_ttm#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Revenue TTM</span><span className={toneByBands(km.revenue_growth_ttm, { green: 0.12, amber: 0.04 }, true)}>{fmt(km.revenue_growth_ttm, "pct")}</span></a>
            <a href={`?focusMetric=rule_of_40#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Rule of 40</span><span className={toneByBands(km.rule_of_40, { green: 40, amber: 25 }, true)}>{fmt(km.rule_of_40)}</span></a>
            <a href={`?focusMetric=forward_fcf_cagr#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Forward FCF CAGR</span><span>{fmt(km.forward_fcf_cagr, "pct")} ({km.forward_fcf_cagr_source ?? "n/a"})</span></a>
          </div>
        </div>

        <div className="border border-secondary-800 bg-secondary-950/40 p-2">
          <div className="text-[11px] uppercase tracking-wide text-secondary-400 mb-1">Finanzen · Coverage {(report.data_quality.coverage.keyMetricCoverage * 100).toFixed(0)}%</div>
          <div className="space-y-1 text-[12px]">
            <a href={`?focusMetric=gross_margin#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Gross Margin {arrow(km.gross_margin_trend)}</span><span className={toneByBands(km.gross_margin, { green: 0.55, amber: 0.35 }, true)}>{fmt(km.gross_margin, "pct")}</span></a>
            <a href={`?focusMetric=operating_margin#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Operating Margin {arrow(km.operating_margin_trend)}</span><span className={toneByBands(km.operating_margin, { green: 0.2, amber: 0.08 }, true)}>{fmt(km.operating_margin, "pct")}</span></a>
            <a href={`?focusMetric=fcf_margin#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>FCF Margin {arrow(km.fcf_margin_trend)}</span><span className={toneByBands(km.fcf_margin, { green: 0.15, amber: 0.06 }, true)}>{fmt(km.fcf_margin, "pct")} · {spark(marginSeries)}</span></a>
            <a href={`?focusMetric=roic_wacc_spread#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>ROIC-WACC</span><span className={toneByBands(km.roic_wacc_spread, { green: 0.02, amber: 0 }, true)}>{fmtSignedPct(km.roic_wacc_spread)}</span></a>
            <a href={`?focusMetric=capex_ocf_ratio#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Capex/OCF</span><span className={toneByBands(km.capex_ocf_ratio, { green: 0.15, amber: 0.35 }, false)}>{fmt(km.capex_ocf_ratio)}</span></a>
            <a href={`?focusMetric=net_debt_to_ebitda#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5" title={debtLowConfidence ? "Provenance low confidence" : undefined}><span>Net Debt/EBITDA{debtLowConfidence ? " *" : ""}</span><span className={toneByBands(km.net_debt_to_ebitda, { green: 2, amber: 4 }, false, debtLowConfidence)}>{fmt(km.net_debt_to_ebitda)}</span></a>
            <a href={`?focusMetric=cash_runway_months#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Cash Runway</span><span>{fmt(km.cash_runway_months, "num", 0)} Monate</span></a>
          </div>
        </div>

        <div className="border border-secondary-800 bg-secondary-950/40 p-2">
          <div className="text-[11px] uppercase tracking-wide text-secondary-400 mb-1">Momentum · Coverage {(report.data_quality.coverage.sourceSupportCoverage * 100).toFixed(0)}%</div>
          <div className="space-y-1 text-[12px]">
            <a href={`?focusMetric=relativeStrength.vsIndex3m#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>RS 3M</span><span>{fmt(report.technicals?.relativeStrength.vsIndex3m, "pct")}</span></a>
            <a href={`?focusMetric=relativeStrength.vsIndex6m#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>RS 6M</span><span>{fmt(report.technicals?.relativeStrength.vsIndex6m, "pct")}</span></a>
            <a href={`?focusMetric=relativeStrength.vsIndex12m#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>RS 12M</span><span>{fmt(report.technicals?.relativeStrength.vsIndex12m, "pct")}</span></a>
            <a href={`?focusMetric=priceVsMa200Pct#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Kurs vs MA200</span><span>{fmt(report.technicals?.priceVsMa200Pct, "pct")}</span></a>
            <a href={`?focusMetric=distanceTo52wHighPct#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Dist. 52W-Hoch</span><span>{fmt(report.technicals?.distanceTo52wHighPct, "pct")}</span></a>
            <a href={`?focusMetric=rsi14#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>RSI</span><span>{fmt(report.technicals?.rsi14)}</span></a>
            <a href={`?focusMetric=short_interest_pct_float#chat-panel`} className="flex justify-between hover:bg-secondary-900/40 px-1 py-0.5"><span>Short % / DTC</span><span>{shortPctStr} / {dtcStr}</span></a>
          </div>
        </div>
      </section>

      {/* ================================================================
          ZONE 4 · FAIR-VALUE-BRÜCKE
          ================================================================ */}
      <section
        className="border border-secondary-800 bg-secondary-950/40 p-2"
        data-testid="fair-value-panel"
      >
        <FairValuePanel fairValue={report.fair_value} keyMetrics={km} reverseDcf={report.reverse_dcf} />
      </section>

      {/* ================================================================
          ZONE 5 · DEEP-DIVE
          ================================================================ */}
      <section className="space-y-2" data-testid="deep-dive-section">
        <CollapsibleSection title="Burggraben & KI-Urteil" icon="◈" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 text-[12px]">
            <div className="space-y-1">
              <div>Moat Rating: <span className="text-secondary-100">{report.moat_assessment.rating}</span></div>
              <div>Evidence: {report.moat_assessment.evidence.join(" · ") || "n/a"}</div>
              <div>Threats: {report.moat_assessment.threats.join(" · ") || "n/a"}</div>
              <div>ROIC-WACC: {fmtSignedPct(km.roic_wacc_spread)}</div>
              <div>GARP-Asymmetrie: {fmtSignedPct(km.reverse_dcf_asymmetry)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-secondary-400">KI-Critic</div>
              <div>These: {report.analyst?.thesis || "n/a — Analyst-Output fehlt"}</div>
              <div>Bull: {report.analyst?.bullCase || "n/a"}</div>
              <div>Bear: {report.analyst?.bearCase || "n/a"}</div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Charts (echte Serien)" icon="▤" defaultOpen={true}>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2" data-testid="charts-row">
            <div className="border border-secondary-800 bg-secondary-950/40 p-2">
              <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Umsatz / EBIT / FCF (jährl.)</div>
              <FinancialsChart data={financialsAnnual} />
              {financialsAnnual.length < 2 && <div className="text-[11px] text-secondary-500 mt-1">Datenreihe unvollständig</div>}
            </div>
            <div className="border border-secondary-800 bg-secondary-950/40 p-2">
              <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Score-Verlauf</div>
              <ScoreTrendChart data={history} />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Forensik & Red Flags" icon="⚑" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 text-[12px]">
            <div className="space-y-1">
              <div>Piotroski F: {fmt(km.piotroski_f, "num", 0)}</div>
              <div>Altman Z: {fmt(km.altman_z)}</div>
              <div>Beneish M: {fmt(km.beneish_m)}</div>
              <div>Mohanram G: {fmt(km.mohanram_g, "num", 0)}</div>
              <div>Debt Breakdown Confidence: {String((report.debt_breakdown as Record<string, unknown> | null)?.confidence ?? "n/a")}</div>
              {report.data_quality.issues.length > 0 && (
                <div className="text-amber-300">Issues: {report.data_quality.issues.join(" · ")}</div>
              )}
            </div>
            <div className="space-y-1">
              <div>Clustered Red Flags: {report.red_flags_clustered.length > 0 ? report.red_flags_clustered.map((x) => x.representative).join(" · ") : "n/a"}</div>
              <div>Hard Blockers: {report.hard_blockers.join(" · ") || "n/a"}</div>
              <div>Business Model: {report.business_model_profile?.type || "n/a"} ({report.business_model_profile?.confidence || "n/a"})</div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Peers" icon="◎" defaultOpen={false}>
          <div className="text-[12px] text-secondary-400">keine Peer-Daten von Providern geliefert — benötigt Peer-Multiples/Bucket.</div>
        </CollapsibleSection>

        <CollapsibleSection title="Segmente" icon="▦" defaultOpen={false}>
          <div className="text-[12px] text-secondary-400">keine Segment-Daten von Providern geliefert — benötigt Segment-Umsatzreihen.</div>
        </CollapsibleSection>

        <CollapsibleSection title="Bär-Case / Red-Team" icon="☍" defaultOpen={false}>
          {report.red_team ? <RedTeamPanel redTeam={report.red_team} /> : <div className="text-[12px] text-secondary-400">kein Red-Team-Output geliefert.</div>}
        </CollapsibleSection>

        <CollapsibleSection title="Verlauf" icon="↻" defaultOpen={false}>
          <div className="text-[12px] text-secondary-300">Score-Trend: {report.score_trend ?? "n/a"} · Confidence {report.confidence_score !== null ? `${fmt(report.confidence_score, "num", 0)}/100` : "n/a"}</div>
          <div className="text-[11px] text-secondary-500 mt-1">Fair-Value-Historie noch nicht im Report verfügbar.</div>
        </CollapsibleSection>

        <CollapsibleSection title="Quellen" icon="☰" defaultOpen={false} count={report.source_list.length}>
          <SourceList sources={report.source_list} />
        </CollapsibleSection>
      </section>

      {/* ================================================================
          ZONE 6 · KI-CHAT
          ================================================================ */}
      <ChatPanel reportId={params.id} ticker={report.ticker} initialFocusMetric={focusMetric} />

      {/* ================================================================
          Kontext-Fußbereich
          ================================================================ */}
      <section className="grid grid-cols-1 gap-2 xl:grid-cols-3" data-testid="context-section">
        <div className="border border-secondary-800 bg-secondary-950/40 p-2" data-testid="market-regime-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Markt Regime</div>
          <div>Regime: {market?.regime ?? report.regime ?? "n/a"}</div>
          <div>Breadth: {fmt(market?.breadth_pct_above_ma200, "pct")}</div>
          <div>VIX: {fmt(market?.vix)}</div>
          <div>HY Spread: {fmt(market?.high_yield_spread, "pct")}</div>
          <div>Zinskurve 10Y2Y: {fmt(market?.yield_curve_10y2y, "pct")}</div>
          {report.timing_score !== null && (
            <div>Timing Score: {fmt(report.timing_score)}</div>
          )}
        </div>

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
              Verwässerung {fmt(km.share_count_growth_yoy, "pct")}
            </span>
            <span className="border border-secondary-700 px-1.5 py-0.5">
              Buyback-Score {report.ownership_score !== null ? fmt(report.ownership_score) : "n/a"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-secondary-400">
            Analyst ↑ {km.analyst_upgrades_3m ?? "n/a"} ↓ {km.analyst_downgrades_3m ?? "n/a"} (3M)
          </div>
        </div>

        <div className="border border-secondary-800 bg-secondary-950/40 p-2" data-testid="momentum-panel">
          <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">Momentum</div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "RSI", value: fmt(report.technicals?.rsi14) },
              { label: "MACD-H", value: fmt(report.technicals?.macd.histogram) },
              { label: "MA200Δ", value: fmt(report.technicals?.priceVsMa200Pct, "pct") },
              { label: "RS6M", value: fmt(report.technicals?.relativeStrength.vsIndex6m, "pct") },
              { label: "Beta", value: fmt(report.technicals?.beta) },
              { label: "SUE", value: fmt(km.earnings_surprise_pct, "pct") },
            ].map(({ label, value }) => (
              <span key={label} className="border border-secondary-700 px-1.5 py-0.5 text-[11px]">
                {label} {value}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border border-secondary-800 bg-secondary-950/40 p-2">
        <div className="uppercase tracking-wide text-secondary-400 text-[11px] mb-1">
          Quellen ({report.source_list.length})
        </div>
        <SourceList sources={report.source_list} />
      </section>
    </main>
  );
}

