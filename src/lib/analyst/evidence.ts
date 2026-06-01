import type { ProviderFact } from "@/lib/providers/types";
import type { CompanyDataset } from "@/lib/schemas/dataset";
import type { Report } from "@/lib/schemas/report";

export interface AnalystEvidenceItem {
  title: string;
  source: string;
  asOf: string;
  summary: string;
}

export interface AnalystEvidencePackage {
  filingsAndNews: AnalystEvidenceItem[];
  segmentTrends: Array<{ segment: string; trend: string; asOf: string; source: string }>;
  deterministicSignals: Record<string, number | string | null>;
  tradeSetup: {
    entryZoneMax: number | null;
    stopRef: number | null;
    riskReward: number | null;
    action: string;
    computable: boolean;
  };
}

function factToEvidence(f: ProviderFact): AnalystEvidenceItem | null {
  if (!f.asOf) return null;
  if (!f.url || f.url.trim().length === 0) return null;
  const summary = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
  return {
    title: f.title || f.field,
    source: f.url,
    asOf: f.asOf,
    summary: summary.slice(0, 400),
  };
}

export function buildAnalystEvidence(
  report: Readonly<Report>,
  dataset: Readonly<CompanyDataset> | null,
  facts: ReadonlyArray<ProviderFact>,
): AnalystEvidencePackage {
  const filingsAndNews = facts
    .filter((f) => /news|rss|filing|sec|edgar|press|release/i.test(`${f.field} ${f.title ?? ""} ${f.url}`))
    .map(factToEvidence)
    .filter((x): x is AnalystEvidenceItem => x !== null)
    .slice(0, 20);

  const segmentTrends = (dataset?.segments ?? []).flatMap((s) => {
    const arr = s.revenueByPeriod;
    if (arr.length < 2) return [];
    const prev = arr[arr.length - 2]!;
    const cur = arr[arr.length - 1]!;
    const trend =
      typeof prev.value === "number" && typeof cur.value === "number" && prev.value !== 0
        ? ((cur.value / prev.value - 1) * 100).toFixed(1) + "%"
        : "unknown";
    const asOf = cur.periodEnd;
    const source = s.provenance[0]?.url ?? "unknown";
    return [{ segment: s.name, trend, asOf, source }];
  });

  const deterministicSignals: Record<string, number | string | null> = {
    score: report.growth_research_score,
    gate: report.gate,
    category: report.category,
    timingScore: report.timing_score,
    regime: report.regime,
    quadrant: report.quadrant?.label ?? null,
    currentVsFairValuePct: report.current_vs_fair_value_pct,
    valuationRegime: report.valuation_regime,
  };

  const tradeSetup = {
    entryZoneMax: report.trade_setup.entry_zone_max,
    stopRef: report.trade_setup.stop_ref,
    riskReward: report.trade_setup.risk_reward,
    action: report.trade_setup.action,
    computable: report.trade_setup.computable,
  };

  return {
    filingsAndNews,
    segmentTrends,
    deterministicSignals,
    tradeSetup,
  };
}
