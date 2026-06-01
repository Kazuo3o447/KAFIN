import type { MarketContext } from "@/lib/schemas/dataset";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type MarketRegime = "risk_on" | "neutral" | "risk_off";

export interface RegimeInput {
  marketContext: MarketContext;
  vixHistory?: number[];
  breadthProxy?: number | null;
  sectorRelativeStrength?: number[];
}

export interface RegimeResult {
  regime: MarketRegime;
  breadthIsProxy: boolean;
  inputs: {
    vixPercentile1y: number | null;
    indexVsMa200Pct: number | null;
    highYieldSpread: number | null;
    highYieldSpreadTrend: number | null;
    yieldCurve10y2y: number | null;
    breadthPctAboveMa200: number | null;
    sectorRotationStrength: number | null;
  };
}

function percentileRank(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  let idx = sorted.findIndex((v) => value <= v);
  if (idx < 0) idx = sorted.length - 1;
  return idx / Math.max(sorted.length - 1, 1);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function classifyMarketRegime(input: RegimeInput): RegimeResult {
  const m = input.marketContext;
  const vixPercentileFromHistory =
    typeof m.vix === "number" && input.vixHistory && input.vixHistory.length > 0
      ? percentileRank(input.vixHistory, m.vix)
      : null;
  const vixPercentile = m.vixPercentile1y ?? vixPercentileFromHistory;

  const breadthRaw = m.breadthPctAboveMa200;
  const breadthIsProxy = breadthRaw === null && typeof input.breadthProxy === "number";
  const breadth = breadthRaw ?? input.breadthProxy ?? null;

  const hyTrend =
    typeof m.highYieldSpread === "number" && typeof m.vix === "number"
      ? m.highYieldSpread - Math.max(m.vix / 1000, 0)
      : null;

  const sectorRotationStrength = average(input.sectorRelativeStrength ?? []);

  const riskOffVotes = [
    typeof vixPercentile === "number" && vixPercentile >= THRESHOLDS.regime_vix_percentile_risk_off_min,
    typeof m.indexVsMa200Pct === "number" && m.indexVsMa200Pct <= THRESHOLDS.regime_index_vs_ma200_risk_off_max,
    typeof m.highYieldSpread === "number" && m.highYieldSpread >= THRESHOLDS.regime_hy_spread_risk_off_min,
    typeof hyTrend === "number" && hyTrend >= THRESHOLDS.regime_hy_spread_trend_risk_off_min,
    typeof m.yieldCurve10y2y === "number" && m.yieldCurve10y2y <= THRESHOLDS.regime_yield_curve_risk_off_max,
    typeof breadth === "number" && breadth <= THRESHOLDS.regime_breadth_risk_off_max,
  ].filter(Boolean).length;

  const riskOnVotes = [
    typeof vixPercentile === "number" && vixPercentile <= THRESHOLDS.regime_vix_percentile_risk_on_max,
    typeof m.indexVsMa200Pct === "number" && m.indexVsMa200Pct >= THRESHOLDS.regime_index_vs_ma200_risk_on_min,
    typeof m.highYieldSpread === "number" && m.highYieldSpread <= THRESHOLDS.regime_hy_spread_risk_on_max,
    typeof m.yieldCurve10y2y === "number" && m.yieldCurve10y2y > THRESHOLDS.regime_yield_curve_risk_off_max,
    typeof breadth === "number" && breadth >= THRESHOLDS.regime_breadth_risk_on_min,
  ].filter(Boolean).length;

  const regime: MarketRegime = riskOffVotes >= 3 ? "risk_off" : riskOnVotes >= 3 ? "risk_on" : "neutral";

  return {
    regime,
    breadthIsProxy,
    inputs: {
      vixPercentile1y: vixPercentile,
      indexVsMa200Pct: m.indexVsMa200Pct,
      highYieldSpread: m.highYieldSpread,
      highYieldSpreadTrend: hyTrend,
      yieldCurve10y2y: m.yieldCurve10y2y,
      breadthPctAboveMa200: breadth,
      sectorRotationStrength,
    },
  };
}
