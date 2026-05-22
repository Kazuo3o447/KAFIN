/**
 * Audit-Dashboard /reports/[id] — Decision-First Redesign (Phase F.4).
 * Server-Component lädt Report-JSON, rendert mit neuen Komponenten.
 */
import fs from "node:fs";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { ReportSchema } from "@/lib/schemas/report";
import { GlassCard } from "@/components/GlassCard";
import { SourceList } from "@/components/SourceList";
import { ExportButtons } from "@/components/ExportButtons";
import { PinButton } from "@/components/PinButton";
import { RedTeamPanel } from "@/components/RedTeamPanel";
import { DecisionHero } from "@/components/DecisionHero";
import { ScoreKpiStrip } from "@/components/ScoreKpiStrip";
import { BlockOverviewBars } from "@/components/BlockOverviewBars";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const modelLabel = Array.from(new Set(usedModels)).join(" / ") || "—";

  // Peer percentiles from DB (Phase B)
  const peerRow = db
    .select()
    .from(schema.peerMetrics)
    .where(eq(schema.peerMetrics.reportId, params.id))
    .get();
  const peerPercentiles: Record<string, number> = peerRow?.percentilesJson
    ? (() => { try { return JSON.parse(peerRow.percentilesJson) as Record<string, number>; } catch { return {}; } })()
    : {};

  return (
    <main className={`mx-auto max-w-5xl px-4 py-6 space-y-4 ${isPrint ? "print-mode" : ""}`}>

      {/* 1. Decision Hero */}
      <DecisionHero
        ticker={report.ticker}
        companyName={report.company_name}
        exchange={report.exchange}
        researchDate={report.research_date}
        gate={report.gate}
        category={report.category}
        confidence={report.confidence}
        verdict={report.verdict ?? null}
        fairValue={report.fair_value ?? null}
        handoff={report.handoff_to_trade_engine}
        isPrint={isPrint}
      >
        {!isPrint && (
          <>
            <ExportButtons reportId={params.id} ticker={report.ticker} />
            <PinButton ticker={report.ticker} reportId={params.id} initiallyPinned={pinned} />
          </>
        )}
      </DecisionHero>

      {/* Model label */}
      <div className="text-xs text-secondary-500 text-right">
        Modell · <span className="font-mono">{modelLabel}</span>
      </div>

      {/* 2. Score + KPI Strip */}
      <ScoreKpiStrip
        score={report.growth_research_score}
        gate={report.gate}
        keyMetrics={km}
        peerPercentiles={peerPercentiles}
        businessModel={report.business_model_type || "Other"}
      />

      {/* 3. Hard Blockers / Red Flags (combined, nur wenn vorhanden) */}
      {(report.hard_blockers.length > 0 || report.red_flags.length > 0) && (
        <GlassCard variant={report.hard_blockers.length > 0 ? "red" : "yellow"} className="p-4 space-y-2">
          {report.hard_blockers.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wide text-red-400">Hard Blockers</h2>
              <ul className="space-y-1 text-sm">
                {report.hard_blockers.map((b, i) => (
                  <li key={i} className="text-red-200">⛔ {b}</li>
                ))}
              </ul>
            </>
          )}
          {report.red_flags.length > 0 && (
            <ul className="space-y-1 text-sm mt-2">
              {report.red_flags.map((f, i) => (
                <li key={i} className="text-amber-200">⚠ {f}</li>
              ))}
            </ul>
          )}
        </GlassCard>
      )}

      {/* 4. Bull / Bear + These */}
      <GlassCard className="p-4">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-2">These</h2>
        {report.thesis_summary && (
          <p className="text-sm text-secondary-200 leading-relaxed mb-4">
            {report.thesis_summary}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-green-400 mb-2">Bull Case</h3>
            <ul className="space-y-1 text-sm">
              {report.bull_case.length
                ? report.bull_case.map((b, i) => <li key={i} className="text-secondary-200">• {b}</li>)
                : <li className="text-secondary-500">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-red-400 mb-2">Bear Case</h3>
            <ul className="space-y-1 text-sm">
              {report.bear_case.length
                ? report.bear_case.map((b, i) => <li key={i} className="text-secondary-200">• {b}</li>)
                : <li className="text-secondary-500">—</li>}
            </ul>
          </div>
        </div>
      </GlassCard>

      {/* 5. Block-Übersicht (immer sichtbar) */}
      <BlockOverviewBars
        audits={report.block_audits}
        breakdown={blockValues}
        hardBlockers={report.hard_blockers}
        isPrint={isPrint}
      />

      {/* 6. Aufklappbare Detail-Sektionen */}
      {(report.moat_assessment.rating !== "Unknown" || report.moat_assessment.evidence.length > 0) && (
        <CollapsibleSection title={`Moat-Analyse · ${report.moat_assessment.rating}`} icon="🛡" isPrint={isPrint}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-green-400 mb-2">Evidence</h3>
              <ul className="space-y-1">
                {report.moat_assessment.evidence.length
                  ? report.moat_assessment.evidence.map((item, i) => <li key={i}>• {item}</li>)
                  : <li className="text-secondary-500">—</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wide text-amber-400 mb-2">Threats</h3>
              <ul className="space-y-1">
                {report.moat_assessment.threats.length
                  ? report.moat_assessment.threats.map((item, i) => <li key={i}>• {item}</li>)
                  : <li className="text-secondary-500">—</li>}
              </ul>
            </div>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Katalysatoren & offene Fragen" icon="⚡" isPrint={isPrint}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-accent-400 mb-2">Katalysatoren</h3>
            <ul className="space-y-1">
              {report.catalysts.length
                ? report.catalysts.map((c, i) => <li key={i}>• {c}</li>)
                : <li className="text-secondary-500">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-amber-400 mb-2">Offene Fragen</h3>
            <ul className="space-y-1">
              {report.open_questions.length
                ? report.open_questions.map((q, i) => <li key={i}>• {q}</li>)
                : <li className="text-secondary-500">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-secondary-300 mb-2">Falsifikations-Tests</h3>
            <ul className="space-y-1">
              {report.falsification_tests.length
                ? report.falsification_tests.map((f, i) => <li key={i}>• {f}</li>)
                : <li className="text-secondary-500">—</li>}
            </ul>
          </div>
        </div>
      </CollapsibleSection>

      {report.red_team && (
        <CollapsibleSection title="Red-Team-Analyse" icon="🎯" isPrint={isPrint}>
          <RedTeamPanel redTeam={report.red_team} />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Quellen" icon="📋" count={report.source_list.length} isPrint={isPrint}>
        <SourceList sources={report.source_list} />
      </CollapsibleSection>

      <footer className="text-xs text-secondary-600 text-center pt-4 pb-6">
        Report ID <code className="font-mono">{params.id}</code> ·{" "}
        <code className="font-mono">{row.runId}</code>
      </footer>
    </main>
  );
}