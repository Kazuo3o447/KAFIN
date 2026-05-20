/**
 * Deterministisches Scoring (research.md §9–§16).
 *
 * LLM liefert pro Block eine Liste von Indikator-Bewertungen 0–10
 * (oder null bei "unknown"). Diese Funktion aggregiert auf Block-Score
 * (0–10), gewichtet zu Total-Score (0–100) und liefert Breakdown.
 */
import { BLOCK_WEIGHTS, type BlockKey } from "./weights";

export interface IndicatorScore {
  key: string;
  value: number | null; // 0..10 oder null = unknown
  rationale?: string;
  sourceIdx?: number[]; // Verweise in source_list
}

export interface BlockResult {
  key: BlockKey;
  /** Mittelwert der nicht-null-Indikatoren (0..10) */
  rawScore: number;
  /** Anteil bewerteter Indikatoren (0..1). Penalty bei vielen "unknown". */
  coverage: number;
  /** Effektiver Block-Score (0..10), nach Coverage-Penalty. */
  effectiveScore: number;
  /** Gewichtsbeitrag zum Total (0..weight). */
  weighted: number;
  indicators: IndicatorScore[];
}

export interface ScoreResult {
  total: number; // 0..100
  blocks: Record<BlockKey, BlockResult>;
  coverage: number; // 0..1 gesamtgewichtetes Coverage
}

const COVERAGE_FLOOR = 0.5; // unter 50 % Indikatoren bewertet → kein Bonus, Penalty linear

export function scoreBlock(
  key: BlockKey,
  indicators: IndicatorScore[],
): BlockResult {
  const weight = BLOCK_WEIGHTS[key];
  const valued = indicators.filter((i) => typeof i.value === "number");
  const coverage = indicators.length > 0 ? valued.length / indicators.length : 0;

  const rawScore =
    valued.length > 0
      ? valued.reduce((s, i) => s + (i.value as number), 0) / valued.length
      : 0;

  // Coverage-Penalty: unter Floor wird linear runtergerechnet.
  const coverageFactor =
    coverage >= COVERAGE_FLOOR ? 1 : coverage / COVERAGE_FLOOR;
  const effectiveScore = rawScore * coverageFactor;

  const weighted = (effectiveScore / 10) * weight;

  return { key, rawScore, coverage, effectiveScore, weighted, indicators };
}

export function computeScore(
  blocks: Record<BlockKey, IndicatorScore[]>,
): ScoreResult {
  const out = {} as Record<BlockKey, BlockResult>;
  let totalWeighted = 0;
  let totalWeight = 0;
  let coverageNumerator = 0;

  for (const key of Object.keys(BLOCK_WEIGHTS) as BlockKey[]) {
    const indicators = blocks[key] ?? [];
    const result = scoreBlock(key, indicators);
    out[key] = result;
    totalWeighted += result.weighted;
    totalWeight += BLOCK_WEIGHTS[key];
    coverageNumerator += result.coverage * BLOCK_WEIGHTS[key];
  }

  return {
    total: Math.round(totalWeighted),
    blocks: out,
    coverage: totalWeight > 0 ? coverageNumerator / totalWeight : 0,
  };
}
