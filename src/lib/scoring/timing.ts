import type { LensScoreResult } from "@/lib/scoring/engine";
import type { TechnicalIndicators } from "@/lib/research/technicals";
import type { MarketRegime } from "@/lib/research/regime";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type QuadrantLabel = "kaufen" | "warten" | "spekulativ" | "meiden";

export interface TimingInputs {
  technicals: TechnicalIndicators;
  estimatesSignals: {
    sue: number | null;
    beatStreak: number | null;
    revisionsBalance: number | null;
  };
  ownershipSignals: {
    squeezeSetup: boolean;
    shortRisk: boolean;
  };
}

export interface TimingOutput {
  timingScore: number;
  quadrant: {
    label: QuadrantLabel;
    xTimingScore: number;
    yFundamentalScore: number;
  };
  actionRecommendation: string;
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function normalize(v: number | null, min: number, max: number): number {
  if (v === null || !Number.isFinite(v)) return 50;
  if (max === min) return 50;
  return clamp(((v - min) / (max - min)) * 100);
}

export function computeTimingScore(input: TimingInputs, regime: MarketRegime): number {
  const t = input.technicals;

  const trend = normalize(t.priceVsMa200Pct, -0.2, 0.2);
  const momentum = normalize(t.relativeStrength.vsIndex6m, -0.25, 0.25);
  const oscillator = t.rsi14 === null ? 50 : t.rsi14 > 70 ? 40 : t.rsi14 < 30 ? 60 : 55;
  const macd = t.macd.histogram === null ? 50 : t.macd.histogram > 0 ? 65 : 35;
  const revisions = typeof input.estimatesSignals.revisionsBalance === "number"
    ? input.estimatesSignals.revisionsBalance
    : null;
  const sue = typeof input.estimatesSignals.sue === "number" ? input.estimatesSignals.sue : null;
  const sentimentSignal = revisions !== null && sue !== null
    ? revisions * 0.25 + sue * 0.75
    : null;
  const sentiment = normalize(sentimentSignal, -2, 2);
  const shortSetup = input.ownershipSignals.squeezeSetup ? 60 : input.ownershipSignals.shortRisk ? 35 : 50;

  let raw =
    trend * 0.24 +
    momentum * 0.24 +
    oscillator * 0.08 +
    macd * 0.08 +
    sentiment * 0.24 +
    shortSetup * 0.12;

  if (regime === "risk_off") raw -= THRESHOLDS.timing_regime_risk_off_penalty;
  return clamp(raw);
}

export function classifyQuadrant(fundamentalScore: number, timingScore: number): QuadrantLabel {
  const fHigh = fundamentalScore >= THRESHOLDS.quadrant_fundamental_high_min;
  const tHigh = timingScore >= THRESHOLDS.quadrant_timing_high_min;
  if (fHigh && tHigh) return "kaufen";
  if (fHigh && !tHigh) return "warten";
  if (!fHigh && tHigh) return "spekulativ";
  return "meiden";
}

export function deriveActionRecommendation(quadrant: QuadrantLabel, regime: MarketRegime): string {
  return THRESHOLDS.timing_action_table[regime][quadrant];
}

export function buildTimingOutput(
  fundamental: LensScoreResult,
  timingInputs: TimingInputs,
  regime: MarketRegime,
): TimingOutput {
  const timingScore = computeTimingScore(timingInputs, regime);
  const fScore = fundamental.score ?? 0;
  const label = classifyQuadrant(fScore, timingScore);
  return {
    timingScore,
    quadrant: {
      label,
      xTimingScore: timingScore,
      yFundamentalScore: fScore,
    },
    actionRecommendation: deriveActionRecommendation(label, regime),
  };
}
