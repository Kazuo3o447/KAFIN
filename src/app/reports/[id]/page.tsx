/**
 * Audit-Dashboard /reports/[id] — Server-Component lädt Report-JSON, übergibt an Client-Tabs.
 */
import fs from "node:fs";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { ReportSchema } from "@/lib/schemas/report";
import { GlassCard } from "@/components/GlassCard";
import { Gauge } from "@/components/Gauge";
import { RadarChart } from "@/components/RadarChart";
import { KpiCard } from "@/components/KpiCard";
import { SourceList } from "@/components/SourceList";
import { ExportButtons } from "@/components/ExportButtons";
import { PinButton } from "@/components/PinButton";
import { AuditTabsClient } from "./AuditTabsClient";
import { BLOCK_WEIGHTS, BLOCK_LABELS, type BlockKey } from "@/lib/scoring/weights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GATE_BADGE: Record<string, string> = {
  Green: "bg-green-700/20 text-green-300 border-green-700/40",
  Yellow: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  Red: "bg-red-700/20 text-red-300 border-red-700/40",
};
const STRIP: Record<string, "green" | "yellow" | "red" | "default"> = {
  Green: "green",
  Yellow: "yellow",
  Red: "red",
};

function formatPct(v: number | null | undefined) {
  if (v === null || v === undefined) return null;
  return Number((v * 100).toFixed(1));
}

export default function ReportDashboardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { print?: string };
}) {
  const isPrint = searchParams?.print === "1";
  const row = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.id, params.id))
    .get();
  if (!row) notFound();

  const jsonPath = row.reportJsonPath;
  if (!jsonPath || !fs.existsSync(jsonPath)) notFound();

  const raw = fs.readFileSync(jsonPath, "utf8");
  const report = ReportSchema.parse(JSON.parse(raw));

  const pinned = !!db
    .select()
    .from(schema.watchlist)
    .where(eq(schema.watchlist.ticker, row.ticker))
    .get();
  const km = report.key_metrics;
  const breakdown = report.score_breakdown;

  const blockValues = Object.fromEntries(
    (Object.keys(BLOCK_WEIGHTS) as BlockKey[]).map((k) => [k, breakdown[k]]),
  ) as Record<BlockKey, number>;
  const usedModels = [row.modelExtract, row.modelScoring, row.modelSummary].filter(
    (v): v is string => Boolean(v),
  );
  const uniqueModels = Array.from(new Set(usedModels));
  const modelLabel = uniqueModels.length <= 1 ? uniqueModels[0] ?? "—" : uniqueModels.join(" / ");

  return (
    <main
      className={`mx-auto w-full space-y-4 ${
        isPrint ? "max-w-none px-2 py-3 print-mode" : "max-w-[92rem] px-3 sm:px-4 lg:px-5 py-5"
      }`}
    >
      {/* Hero */}
      <GlassCard variant={STRIP[report.gate] ?? "default"} className="p-4 sm:p-5">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <div className="xl:col-span-6">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-semibold tracking-tight font-mono text-accent-400">
                {report.ticker}
              </h1>
              <span className="text-lg text-secondary-300">{report.company_name}</span>
              <span className="text-xs text-secondary-500">{report.exchange}</span>
            </div>
            <div className="mt-2 text-sm text-secondary-400 space-x-3">
              <span>{report.isin || "ISIN —"}</span>
              <span>·</span>
              <span>{report.sector || "—"}</span>
              <span>·</span>
              <span>{report.industry || "—"}</span>
              <span>·</span>
              <span>Stand {report.research_date}</span>
            </div>
            <div className="mt-2 text-xs text-secondary-500">
              Modell · <span className="font-mono">{modelLabel}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`text-xs uppercase tracking-wide px-2 py-1 rounded border ${
                  GATE_BADGE[report.gate] ?? ""
                }`}
              >
                Gate · {report.gate}
              </span>
              <span className="text-xs uppercase tracking-wide px-2 py-1 rounded border border-secondary-700 text-secondary-300">
                {report.category}
              </span>
              <span className="text-xs uppercase tracking-wide px-2 py-1 rounded border border-secondary-700 text-secondary-400">
                Confidence · {report.confidence}
              </span>
              {report.handoff_to_trade_engine ? (
                <span className="text-xs uppercase tracking-wide px-2 py-1 rounded border border-green-700/40 text-green-400">
                  Handoff → Trade Engine
                </span>
              ) : null}
            </div>
            {!isPrint ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <ExportButtons reportId={params.id} ticker={report.ticker} />
                <PinButton
                  ticker={report.ticker}
                  reportId={params.id}
                  initiallyPinned={pinned}
                />
              </div>
            ) : null}
          </div>

          <div className="xl:col-span-3">
            <Gauge score={report.growth_research_score} gate={report.gate} size={220} />
          </div>

          <div className="xl:col-span-3 grid grid-cols-2 gap-2">
            <KpiCard label="Revenue YoY" value={formatPct(km.revenue_growth_yoy)} unit="%" />
            <KpiCard label="PEG Ratio" value={km.peg} />
            <KpiCard label="Rule of 40" value={km.rule_of_40} />
            <KpiCard label="ROIC" value={formatPct(km.roic)} unit="%" />
          </div>
        </div>
      </GlassCard>

      {/* Radar + KPIs */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <GlassCard className="p-4 xl:col-span-4">
          <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">7-Block-Radar</h2>
          <RadarChart values={blockValues} />
        </GlassCard>

        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3 xl:col-span-8">
          <KpiCard label="Revenue Growth YoY" value={formatPct(km.revenue_growth_yoy)} unit="%" />
          <KpiCard label="3y CAGR" value={formatPct(km.revenue_cagr_3y)} unit="%" />
          <KpiCard label="Gross Margin" value={formatPct(km.gross_margin)} unit="%" />
          <KpiCard label="Operating Margin" value={formatPct(km.operating_margin)} unit="%" />
          <KpiCard label="FCF Margin" value={formatPct(km.fcf_margin)} unit="%" />
          <KpiCard label="ROIC" value={formatPct(km.roic)} unit="%" />
          <KpiCard label="PEG Ratio" value={km.peg} />
          <KpiCard label="Rule of 40" value={km.rule_of_40} />
          <KpiCard label="Rule of X" value={km.rule_of_x} />
          <KpiCard label="Share Growth YoY" value={formatPct(km.share_count_growth_yoy)} unit="%" />
          <KpiCard label="SBC / Revenue" value={formatPct(km.sbc_to_revenue)} unit="%" />
          <KpiCard label="Net Debt / EBITDA" value={km.net_debt_to_ebitda} />
          <KpiCard label="EV / Sales" value={km.ev_sales} />
          <KpiCard label="EV / Gross Profit" value={km.ev_gross_profit} />
          <KpiCard label="NTM P/E" value={km.ntm_pe} />
          <KpiCard label="Beta" value={km.beta} />
        </div>
      </section>

      {/* These / Bull / Bear */}
      <GlassCard className="p-4">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-2">These</h2>
        <p className="text-sm text-secondary-200 leading-relaxed">
          {report.thesis_summary || "—"}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-green-400 mb-2">Bull Case</h3>
            <ul className="space-y-1 text-sm">
              {report.bull_case.length ? (
                report.bull_case.map((b, i) => (
                  <li key={i} className="text-secondary-200">• {b}</li>
                ))
              ) : (
                <li className="text-secondary-500">—</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-red-400 mb-2">Bear Case</h3>
            <ul className="space-y-1 text-sm">
              {report.bear_case.length ? (
                report.bear_case.map((b, i) => (
                  <li key={i} className="text-secondary-200">• {b}</li>
                ))
              ) : (
                <li className="text-secondary-500">—</li>
              )}
            </ul>
          </div>
        </div>
      </GlassCard>

      {/* 7-Block-Tabs */}
      <section>
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">Block-Detail</h2>
        <AuditTabsClient
          breakdown={blockValues}
          maxima={BLOCK_WEIGHTS as Record<BlockKey, number>}
          labels={BLOCK_LABELS}
          audits={report.block_audits}
        />
      </section>

      {/* Hard Blockers */}
      {report.hard_blockers.length > 0 ? (
        <GlassCard variant="red" className="p-4">
          <h2 className="text-sm uppercase tracking-wide text-red-400 mb-2">Hard Blockers</h2>
          <ul className="space-y-1 text-sm">
            {report.hard_blockers.map((b, i) => (
              <li key={i} className="text-red-200">⛔ {b}</li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {report.red_flags.length > 0 ? (
        <GlassCard variant="red" className="p-4">
          <h2 className="text-sm uppercase tracking-wide text-red-400 mb-2">Red Flags</h2>
          <ul className="space-y-1 text-sm">
            {report.red_flags.map((flag, i) => (
              <li key={i} className="text-red-200">• {flag}</li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {report.moat_assessment.rating !== "Unknown" ||
      report.moat_assessment.evidence.length > 0 ||
      report.moat_assessment.threats.length > 0 ? (
        <GlassCard className="p-4">
          <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-2">
            Moat · {report.moat_assessment.rating}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-green-400 mb-2">Evidence</h3>
              <ul className="space-y-1">
                {report.moat_assessment.evidence.length ? (
                  report.moat_assessment.evidence.map((item, i) => <li key={i}>• {item}</li>)
                ) : (
                  <li className="text-secondary-500">—</li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wide text-amber-400 mb-2">Threats</h3>
              <ul className="space-y-1">
                {report.moat_assessment.threats.length ? (
                  report.moat_assessment.threats.map((item, i) => <li key={i}>• {item}</li>)
                ) : (
                  <li className="text-secondary-500">—</li>
                )}
              </ul>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {/* Catalysts / Open Questions / Falsification */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-4">
          <h3 className="text-xs uppercase tracking-wide text-accent-400 mb-2">Katalysatoren</h3>
          <ul className="space-y-1 text-sm">
            {report.catalysts.length ? (
              report.catalysts.map((c, i) => <li key={i}>• {c}</li>)
            ) : (
              <li className="text-secondary-500">—</li>
            )}
          </ul>
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="text-xs uppercase tracking-wide text-amber-400 mb-2">Offene Fragen</h3>
          <ul className="space-y-1 text-sm">
            {report.open_questions.length ? (
              report.open_questions.map((q, i) => <li key={i}>• {q}</li>)
            ) : (
              <li className="text-secondary-500">—</li>
            )}
          </ul>
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="text-xs uppercase tracking-wide text-secondary-300 mb-2">Falsifikations-Tests</h3>
          <ul className="space-y-1 text-sm">
            {report.falsification_tests.length ? (
              report.falsification_tests.map((f, i) => <li key={i}>• {f}</li>)
            ) : (
              <li className="text-secondary-500">—</li>
            )}
          </ul>
        </GlassCard>
      </section>

      {/* Quellen */}
      <GlassCard className="p-4">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-3">
          Quellen ({report.source_list.length})
        </h2>
        <SourceList sources={report.source_list} />
      </GlassCard>

      <footer className="text-xs text-secondary-600 text-center pt-4">
        Report ID <code className="font-mono">{params.id}</code> · runId{" "}
        <code className="font-mono">{row.runId}</code>
      </footer>
    </main>
  );
}
