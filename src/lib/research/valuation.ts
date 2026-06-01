import type { CompanyDataset } from "@/lib/schemas/dataset";
import type { DerivedMetrics } from "@/lib/research/derived-metrics";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type ValuationRegime = "pre_profit" | "cyclical" | "mature";
export type ExpectationsGap = "market_underexpecting" | "fair" | "market_overexpecting";

export interface ValuationMethod {
  name: "ev_sales" | "ev_gross_profit" | "pe" | "peg" | "pfcf" | "book";
  enabled: boolean;
  fairValue: number | null;
  stability: number;
}

export interface FairValueCorridor {
  min: number | null;
  median: number | null;
  max: number | null;
  methods: ValuationMethod[];
  currentVsFairValuePct: number | null;
  expectationsGap: ExpectationsGap;
}

function sigmoidStability(stddev: number | null): number {
  if (stddev === null) return 0;
  return Math.max(0, Math.min(1, 1 - stddev / 0.5));
}

export function detectValuationRegime(dataset: CompanyDataset, m: DerivedMetrics): ValuationRegime {
  const latestAnnual = dataset.annual[dataset.annual.length - 1];
  const ebit = latestAnnual?.ebit.value ?? null;
  const epsProxy =
    latestAnnual?.netIncome.value !== null && latestAnnual?.sharesDiluted.value !== null && (latestAnnual?.sharesDiluted.value ?? 0) > 0
      ? latestAnnual!.netIncome.value! / latestAnnual!.sharesDiluted.value!
      : null;

  if (
    (ebit ?? THRESHOLDS.valuation_preprofit_ebit_floor) <= THRESHOLDS.valuation_preprofit_ebit_floor ||
    (epsProxy ?? THRESHOLDS.valuation_preprofit_eps_floor) <= THRESHOLDS.valuation_preprofit_eps_floor
  ) {
    if ((m.revenueCagr3y ?? 0) > 0 && (m.operatingMarginTrend ?? -1) > THRESHOLDS.valuation_margin_trend_positive) {
      return "pre_profit";
    }
  }

  const marginStd = m.operatingMarginStddev ?? 0;
  const growthCagr = m.revenueCagr3y ?? m.revenueCagr5y ?? m.revenueCagr10y ?? 0;
  const growthProfile = growthCagr >= 0.1 && (m.operatingMarginTrend ?? 0) > -0.01;
  const volatilityEvidence =
    marginStd >= THRESHOLDS.valuation_cyclical_margin_stddev &&
    (growthCagr < 0.1 || (m.grossMarginTrend ?? 0) < -0.01 || (m.revenueAcceleration ?? 0) < -0.02);

  if (volatilityEvidence) {
    return "cyclical";
  }

  const recentPositive = dataset.annual
    .slice(-THRESHOLDS.valuation_stable_positive_years)
    .every((x) => (x.ebit.value ?? -1) > 0);
  if (recentPositive && (m.operatingMarginStddev ?? 1) <= THRESHOLDS.valuation_mature_margin_stddev) {
    return "mature";
  }

  if (growthProfile && marginStd <= THRESHOLDS.valuation_cyclical_margin_stddev) {
    return "mature";
  }

  // Neutral fallback: avoid forcing "cyclical" without explicit volatility evidence.
  return "mature";
}

function midpoint(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return (a + b) / 2;
}

export function buildFairValueCorridor(dataset: CompanyDataset, m: DerivedMetrics, regime: ValuationRegime): FairValueCorridor {
  const price = dataset.prices.daily.at(-1)?.close ?? null;
  const methods: ValuationMethod[] = [];

  const baseEvSales = m.evSales !== null && m.revenueCagr3yFwd !== null ? (m.evSales * (1 + m.revenueCagr3yFwd)) : null;
  methods.push({
    name: "ev_sales",
    enabled: regime !== "mature" || m.evSales !== null,
    fairValue: baseEvSales,
    stability: sigmoidStability(m.grossMarginStddev),
  });

  const baseEvGp = m.evGrossProfit !== null && m.revenueCagr3yFwd !== null ? (m.evGrossProfit * (1 + m.revenueCagr3yFwd)) : null;
  methods.push({
    name: "ev_gross_profit",
    enabled: regime !== "mature" || m.evGrossProfit !== null,
    fairValue: baseEvGp,
    stability: sigmoidStability(m.grossMarginStddev),
  });

  methods.push({
    name: "pe",
    enabled: regime === "mature",
    fairValue: regime === "mature" ? midpoint(m.pe, m.pe !== null ? m.pe * 1.1 : null) : null,
    stability: sigmoidStability(m.operatingMarginStddev),
  });

  methods.push({
    name: "peg",
    enabled: regime === "mature",
    fairValue: regime === "mature" && m.peg !== null && m.revenueCagr3yFwd !== null ? m.peg * m.revenueCagr3yFwd * 100 : null,
    stability: sigmoidStability(m.operatingMarginStddev),
  });

  methods.push({
    name: "pfcf",
    enabled: m.pfcf !== null && m.fcfMargin !== null && m.fcfMargin > 0,
    fairValue: m.pfcf !== null && m.fcfMargin !== null ? m.pfcf * (1 + Math.max(m.fcfMarginTrend ?? 0, 0)) : null,
    stability: sigmoidStability(m.fcfMarginStddev),
  });

  methods.push({
    name: "book",
    enabled: regime === "cyclical",
    fairValue: regime === "cyclical" ? midpoint(m.evSales, m.evEbit) : null,
    stability: sigmoidStability(m.operatingMarginStddev),
  });

  const survivors = methods.filter((x) => x.enabled && x.fairValue !== null && x.stability >= THRESHOLDS.fair_value_min_stability);
  const fairValues = survivors.map((x) => x.fairValue as number).sort((a, b) => a - b);

  const min = fairValues.length > 0 ? fairValues[0]! : null;
  const max = fairValues.length > 0 ? fairValues[fairValues.length - 1]! : null;
  const median = fairValues.length > 0 ? fairValues[Math.floor(fairValues.length / 2)]! : null;

  const currentVsFairValuePct = price !== null && median !== null && median !== 0 ? (price / median) - 1 : null;

  const implied = m.revenueCagr3yFwd;
  const priced = m.revenueCagr3y;
  let expectationsGap: ExpectationsGap = "fair";
  if (typeof implied === "number" && typeof priced === "number") {
    const gap = implied - priced;
    if (gap > 0.05) expectationsGap = "market_underexpecting";
    else if (gap < -0.05) expectationsGap = "market_overexpecting";
  }

  return {
    min,
    median,
    max,
    methods,
    currentVsFairValuePct,
    expectationsGap,
  };
}
