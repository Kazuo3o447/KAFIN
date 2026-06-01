/**
 * Report-Diff – vergleicht zwei Reports (alt → neu) und liefert strukturierte Δ-Daten.
 * Bewusst ohne externe Dependency: deterministisch, gut testbar.
 */
import type { Report, BlockAudit } from "@/lib/schemas/report";
import type { BlockKey } from "@/lib/scoring/weights";
import { RESEARCH_BLOCK_RUBRIC } from "@/lib/research/rubric";

export interface NumberDelta {
  key: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  pctDelta: number | null;
}

export interface BlockDelta {
  block: BlockKey;
  before: number;
  after: number;
  delta: number;
  max: number;
}

export interface ListDelta {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface IndicatorDelta {
  block: BlockKey;
  name: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  rationaleChanged: boolean;
}

export interface ReportDiff {
  meta: {
    ticker: string;
    a: { id: string; date: string; score: number; gate: string; category: string; confidence: string };
    b: { id: string; date: string; score: number; gate: string; category: string; confidence: string };
    scoreDelta: number;
    gateChanged: boolean;
    categoryChanged: boolean;
    confidenceChanged: boolean;
  };
  blocks: BlockDelta[];
  keyMetrics: NumberDelta[];
  bullCase: ListDelta;
  bearCase: ListDelta;
  catalysts: ListDelta;
  redFlags: ListDelta;
  hardBlockers: ListDelta;
  openQuestions: ListDelta;
  indicators: IndicatorDelta[];
  thesisSummary: { before: string; after: string; changed: boolean };
}

const BLOCK_MAX: Record<BlockKey, number> = {
  growth_market: 18,
  unit_economics_margins: 14,
  quality_moat: 18,
  valuation: 14,
  capital_discipline_dilution: 12,
  catalysts_revisions_sentiment: 8,
  ownership_smart_money: 8,
  risk_fragility: 8,
};

function diffNumber(before: number | null | undefined, after: number | null | undefined) {
  const a = before ?? null;
  const b = after ?? null;
  if (a === null || b === null) {
    return { delta: null, pctDelta: null };
  }
  const delta = b - a;
  const pctDelta = a !== 0 ? delta / Math.abs(a) : null;
  return { delta, pctDelta };
}

function diffList(before: readonly string[], after: readonly string[]): ListDelta {
  const setA = new Set(before);
  const setB = new Set(after);
  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];
  for (const v of after) if (!setA.has(v)) added.push(v);
  for (const v of before) if (!setB.has(v)) removed.push(v);
  for (const v of after) if (setA.has(v)) unchanged.push(v);
  return { added, removed, unchanged };
}

function normalizeIndicatorName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalIndicatorName(block: BlockKey, name: string): string {
  const normalized = normalizeIndicatorName(name);
  const rubric = RESEARCH_BLOCK_RUBRIC[block];
  for (const indicator of rubric.indicators) {
    const candidates = [indicator.key, indicator.label, ...(indicator.aliases ?? [])].map(normalizeIndicatorName);
    if (candidates.includes(normalized)) return indicator.key;
  }
  for (const indicator of rubric.indicators) {
    const candidates = [indicator.key, indicator.label, ...(indicator.aliases ?? [])].map(normalizeIndicatorName);
    if (candidates.some((candidate) => candidate && normalized.includes(candidate))) return indicator.key;
  }
  return normalized || name;
}

function indicatorMap(audit: BlockAudit | undefined): Map<string, BlockAudit["indicators"][number]> {
  const out = new Map<string, BlockAudit["indicators"][number]>();
  if (!audit) return out;
  for (const indicator of audit.indicators) {
    out.set(canonicalIndicatorName(audit.block, indicator.name), indicator);
  }
  return out;
}

function diffIndicators(a: BlockAudit[], b: BlockAudit[]): IndicatorDelta[] {
  const result: IndicatorDelta[] = [];
  const allBlocks = new Set<BlockKey>();
  a.forEach((x) => allBlocks.add(x.block));
  b.forEach((x) => allBlocks.add(x.block));

  for (const block of allBlocks) {
    const aud = a.find((x) => x.block === block);
    const bud = b.find((x) => x.block === block);
    const aiByName = indicatorMap(aud);
    const biByName = indicatorMap(bud);
    const names = new Set<string>([...aiByName.keys(), ...biByName.keys()]);
    for (const name of names) {
      const ai = aiByName.get(name);
      const bi = biByName.get(name);
      const before = ai?.score ?? null;
      const after = bi?.score ?? null;
      const delta = before !== null && after !== null ? after - before : null;
      const rationaleChanged = (ai?.rationale ?? "") !== (bi?.rationale ?? "");
      // nur ausgeben, wenn etwas relevant unterschiedlich ist
      if (delta !== null && Math.abs(delta) > 0.001) {
        result.push({ block, name, before, after, delta, rationaleChanged });
      } else if (before !== after) {
        result.push({ block, name, before, after, delta, rationaleChanged });
      } else if (rationaleChanged) {
        result.push({ block, name, before, after, delta: 0, rationaleChanged });
      }
    }
  }
  return result.sort((x, y) => Math.abs(y.delta ?? 0) - Math.abs(x.delta ?? 0));
}

export interface DiffInput {
  id: string;
  report: Report;
}

/** Vergleicht zwei Reports (a = älter, b = neuer). Reihenfolge wird vom Aufrufer gewählt. */
export function diffReports(a: DiffInput, b: DiffInput): ReportDiff {
  const blocks: BlockDelta[] = (Object.keys(BLOCK_MAX) as BlockKey[]).map((block) => {
    const before = a.report.score_breakdown[block] ?? 0;
    const after = b.report.score_breakdown[block] ?? 0;
    return {
      block,
      before,
      after,
      delta: Number((after - before).toFixed(2)),
      max: BLOCK_MAX[block],
    };
  });

  const kmKeys = Object.keys(a.report.key_metrics) as (keyof typeof a.report.key_metrics)[];
  const keyMetrics: NumberDelta[] = kmKeys.map((k) => {
    const before = a.report.key_metrics[k];
    const after = b.report.key_metrics[k];
    const { delta, pctDelta } = diffNumber(before, after);
    return { key: String(k), before: before ?? null, after: after ?? null, delta, pctDelta };
  });

  return {
    meta: {
      ticker: a.report.ticker,
      a: {
        id: a.id,
        date: a.report.research_date,
        score: a.report.growth_research_score ?? 0,
        gate: a.report.gate,
        category: a.report.category,
        confidence: a.report.confidence,
      },
      b: {
        id: b.id,
        date: b.report.research_date,
        score: b.report.growth_research_score ?? 0,
        gate: b.report.gate,
        category: b.report.category,
        confidence: b.report.confidence,
      },
      scoreDelta: Number(((b.report.growth_research_score ?? 0) - (a.report.growth_research_score ?? 0)).toFixed(2)),
      gateChanged: a.report.gate !== b.report.gate,
      categoryChanged: a.report.category !== b.report.category,
      confidenceChanged: a.report.confidence !== b.report.confidence,
    },
    blocks,
    keyMetrics,
    bullCase: diffList(a.report.bull_case, b.report.bull_case),
    bearCase: diffList(a.report.bear_case, b.report.bear_case),
    catalysts: diffList(a.report.catalysts, b.report.catalysts),
    redFlags: diffList(a.report.red_flags, b.report.red_flags),
    hardBlockers: diffList(a.report.hard_blockers, b.report.hard_blockers),
    openQuestions: diffList(a.report.open_questions, b.report.open_questions),
    indicators: diffIndicators(a.report.block_audits ?? [], b.report.block_audits ?? []),
    thesisSummary: {
      before: a.report.thesis_summary,
      after: b.report.thesis_summary,
      changed: a.report.thesis_summary.trim() !== b.report.thesis_summary.trim(),
    },
  };
}
