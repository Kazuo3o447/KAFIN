import type { CompanyDataset } from "@/lib/schemas/dataset";
import type { DerivedMetrics } from "@/lib/research/derived-metrics";
import type { THRESHOLDS } from "@/lib/research/thresholds";

type Thresholds = typeof THRESHOLDS;

export type IndicatorFn = (m: DerivedMetrics, d: CompanyDataset, t: Thresholds) => {
  score: number | null;
  reason: string;
  inputs: string[];
};

function scoreByBands(value: number, bands: Array<{ min: number; score: number }>): number {
  const sorted = bands.slice().sort((a, b) => a.min - b.min);
  let out = 0;
  for (const b of sorted) {
    if (value >= b.min) out = b.score;
  }
  return out;
}

function missing(reason: string, inputs: string[]): { score: null; reason: string; inputs: string[] } {
  return { score: null, reason, inputs };
}

export const INDICATOR_FUNCTIONS: Record<string, IndicatorFn> = {
  revenue_growth_quality: (m, _d, t) => {
    if (m.revenueCagr3y === null) return missing("revenueCagr3y fehlt", ["revenueCagr3y"]);
    const score = scoreByBands(m.revenueCagr3y, [
      { min: 0, score: 2 },
      { min: t.growth_revenue_yoy_strong, score: 7 },
      { min: t.growth_revenue_yoy_excellent, score: 10 },
    ]);
    return { score, reason: `Umsatz-CAGR3Y ${Math.round(m.revenueCagr3y * 1000) / 10}%`, inputs: ["revenueCagr3y"] };
  },
  revenue_cagr_3y: (m, _d, t) => {
    if (m.revenueCagr3y === null) return missing("revenueCagr3y fehlt", ["revenueCagr3y"]);
    const score = scoreByBands(m.revenueCagr3y, [
      { min: 0, score: 1 },
      { min: t.growth_revenue_cagr3y_strong, score: 7 },
      { min: t.growth_revenue_cagr3y_excellent, score: 10 },
    ]);
    return { score, reason: `CAGR3Y ${Math.round(m.revenueCagr3y * 1000) / 10}%`, inputs: ["revenueCagr3y"] };
  },
  customer_retention_expansion: (m, _d, t) => {
    const v = m.revenueAcceleration;
    if (v === null) return missing("Umsatz-Beschleunigung fehlt", ["revenueAcceleration"]);
    const score = v > t.growth_acceleration_positive ? 8 : v > 0 ? 6 : 3;
    return { score, reason: `Beschleunigung ${Math.round(v * 1000) / 10}pp`, inputs: ["revenueAcceleration"] };
  },
  tam_share_gain_evidence: (m, _d, t) => {
    const v = m.revenueAcceleration;
    if (v === null) return missing("Marktanteils-Proxy fehlt", ["revenueAcceleration"]);
    const score = v > t.growth_acceleration_positive ? 7 : 4;
    return { score, reason: `Marktanteil-Proxy via Beschleunigung ${Math.round(v * 1000) / 10}pp`, inputs: ["revenueAcceleration"] };
  },

  gross_margin_quality: (m, _d, t) => {
    if (m.grossMargin === null) return missing("grossMargin fehlt", ["grossMargin"]);
    const score = scoreByBands(m.grossMargin, [
      { min: 0, score: 2 },
      { min: t.gross_margin_strong, score: 8 },
    ]);
    return { score, reason: `Bruttomarge ${Math.round(m.grossMargin * 1000) / 10}%`, inputs: ["grossMargin"] };
  },
  operating_leverage: (m, _d, t) => {
    if (m.operatingMarginTrend === null) return missing("operatingMarginTrend fehlt", ["operatingMarginTrend"]);
    const score = m.operatingMarginTrend > t.inflection_slope_min ? 8 : m.operatingMarginTrend > 0 ? 6 : 3;
    return { score, reason: `Operative-Margen-Trend ${Math.round(m.operatingMarginTrend * 10000) / 100}%p/J`, inputs: ["operatingMarginTrend"] };
  },
  fcf_efficiency: (m, _d, t) => {
    if (m.fcfMargin === null) return missing("fcfMargin fehlt", ["fcfMargin"]);
    const score = scoreByBands(m.fcfMargin, [
      { min: -1, score: 1 },
      { min: 0, score: 5 },
      { min: t.fcf_margin_strong, score: 9 },
    ]);
    return { score, reason: `FCF-Marge ${Math.round(m.fcfMargin * 1000) / 10}%`, inputs: ["fcfMargin"] };
  },
  rule_of_40_x_20: (m, _d, t) => {
    if (m.revenueCagr3y === null || m.fcfMargin === null) return missing("Rule-of-40 Inputs fehlen", ["revenueCagr3y", "fcfMargin"]);
    const rule = m.revenueCagr3y * 100 + m.fcfMargin * 100;
    const score = scoreByBands(rule, [
      { min: 0, score: 2 },
      { min: t.rule_of_40_floor, score: 8 },
      { min: t.rule_of_x_floor, score: 10 },
    ]);
    return { score, reason: `Rule ${Math.round(rule * 10) / 10}`, inputs: ["revenueCagr3y", "fcfMargin"] };
  },

  moat_source_evidence: (m, _d, t) => {
    if (m.roicWaccSpread === null) return missing("roicWaccSpread fehlt", ["roicWaccSpread"]);
    const score = m.roicWaccSpread > t.roic_wacc_spread_min ? 8 : 4;
    return { score, reason: `ROIC-WACC ${Math.round(m.roicWaccSpread * 1000) / 10}%p`, inputs: ["roicWaccSpread"] };
  },
  quantitative_moat_trace: (m, _d, t) => {
    if (m.roic === null) return missing("roic fehlt", ["roic"]);
    const score = m.roic >= t.roic_strong ? 9 : m.roic >= t.roce_strong ? 7 : 4;
    return { score, reason: `ROIC ${Math.round(m.roic * 1000) / 10}%`, inputs: ["roic"] };
  },
  durability_trend: (m, _d, t) => {
    if (m.grossMarginStddev === null) return missing("grossMarginStddev fehlt", ["grossMarginStddev"]);
    const score = m.grossMarginStddev <= t.margin_stability_max_stddev ? 8 : 4;
    return { score, reason: `GM-Stabilität σ=${Math.round(m.grossMarginStddev * 1000) / 10}%p`, inputs: ["grossMarginStddev"] };
  },
  business_quality_returns: (m, _d, t) => {
    if (m.roe === null) return missing("roe fehlt", ["roe"]);
    const score = m.roe >= t.roe_strong ? 8 : 5;
    return { score, reason: `ROE ${Math.round(m.roe * 1000) / 10}%`, inputs: ["roe"] };
  },

  growth_adjusted_multiple: (m, _d, t) => {
    if (m.valuationZ.evSales === null) return missing("EV/Sales Z fehlt", ["valuationZ.evSales"]);
    const score = m.valuationZ.evSales <= t.valuation_history_z_cheap ? 9 : m.valuationZ.evSales >= t.valuation_history_z_expensive ? 3 : 6;
    return { score, reason: `EV/Sales Z ${Math.round(m.valuationZ.evSales * 100) / 100}`, inputs: ["valuationZ.evSales"] };
  },
  historical_relative_valuation: (m, _d, t) => {
    if (m.valuationZ.pe === null) return missing("PE Z fehlt", ["valuationZ.pe"]);
    const score = m.valuationZ.pe <= t.valuation_history_z_cheap ? 8 : m.valuationZ.pe >= t.valuation_history_z_expensive ? 3 : 6;
    return { score, reason: `PE Z ${Math.round(m.valuationZ.pe * 100) / 100}`, inputs: ["valuationZ.pe"] };
  },
  expectation_risk: (m, _d, t) => {
    if (m.upsideToTargetPct === null) return missing("upsideToTargetPct fehlt", ["upsideToTargetPct"]);
    const score = m.upsideToTargetPct >= t.valuation_upside_positive ? 8 : m.upsideToTargetPct <= t.valuation_upside_negative ? 3 : 6;
    return { score, reason: `Upside ${Math.round(m.upsideToTargetPct * 1000) / 10}%`, inputs: ["upsideToTargetPct"] };
  },

  share_count_dilution: (m, _d, t) => {
    if (m.dilutionOverhang === null) return missing("dilutionOverhang fehlt", ["dilutionOverhang"]);
    const score = m.dilutionOverhang <= t.share_count_growth_red_flag ? 8 : m.dilutionOverhang >= t.share_count_growth_extreme ? 1 : 4;
    return { score, reason: `Verwässerung ${Math.round(m.dilutionOverhang * 1000) / 10}%`, inputs: ["dilutionOverhang"] };
  },
  sbc_burden: (m, _d, _t) => {
    if (m.accrualsRatio === null) return missing("accrualsRatio fehlt", ["accrualsRatio"]);
    const score = m.accrualsRatio < 0.05 ? 8 : m.accrualsRatio < 0.12 ? 5 : 2;
    return { score, reason: `Accruals ${Math.round(m.accrualsRatio * 1000) / 10}%`, inputs: ["accrualsRatio"] };
  },
  balance_sheet_runway: (m, _d, t) => {
    if (m.cashRunwayMonths === null) return missing("cashRunwayMonths fehlt", ["cashRunwayMonths"]);
    const score = m.cashRunwayMonths >= t.cash_runway_warning_months ? 8 : m.cashRunwayMonths < t.cash_runway_hard_blocker_months ? 1 : 4;
    return { score, reason: `Runway ${Math.round(m.cashRunwayMonths)} Monate`, inputs: ["cashRunwayMonths"] };
  },
  fcf_after_sbc: (m, _d, _t) => {
    if (m.cashConversion === null) return missing("cashConversion fehlt", ["cashConversion"]);
    const score = m.cashConversion > 1 ? 9 : m.cashConversion > 0.7 ? 6 : 3;
    return { score, reason: `Cash Conversion ${Math.round(m.cashConversion * 100) / 100}`, inputs: ["cashConversion"] };
  },

  fundamental_catalysts: (m, _d, t) => {
    if (m.sue === null) return missing("SUE fehlt", ["sue"]);
    const score = m.sue >= t.catalysts_sue_positive ? 8 : m.sue > 0 ? 6 : 3;
    return { score, reason: `SUE ${Math.round(m.sue * 100) / 100}`, inputs: ["sue"] };
  },
  estimate_revisions: (m, _d, t) => {
    if (m.revisionsBalance === null) return missing("revisionsBalance fehlt", ["revisionsBalance"]);
    const score = m.revisionsBalance >= t.revisions_positive ? 8 : m.revisionsBalance > 0 ? 6 : 3;
    return { score, reason: `Revisionen ${m.revisionsBalance}`, inputs: ["revisionsBalance"] };
  },
  news_sentiment_quality: (m, _d, t) => {
    if (m.beatStreak === null) return missing("beatStreak fehlt", ["beatStreak"]);
    const score = m.beatStreak >= t.beat_streak_strong ? 8 : m.beatStreak > 0 ? 6 : 3;
    return { score, reason: `Beat-Serie ${m.beatStreak}`, inputs: ["beatStreak"] };
  },

  insider_cluster_buying: (_m, d, t) => {
    const tx = d.insiderTransactions;
    if (tx.length === 0) return missing("insiderTransactions fehlen", ["insiderTransactions"]);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - t.insider_cluster_window_days);
    const buys = tx.filter((row) => row.type === "buy" && new Date(row.date) >= cutoff);
    const score = buys.length >= t.insider_cluster_min_buy_count ? 8 : buys.length > 0 ? 6 : 3;
    return { score, reason: `Insider-Käufe ${buys.length} im ${t.insider_cluster_window_days}T-Fenster`, inputs: ["insiderTransactions"] };
  },
  institutional_flow_trend: (_m, d, _t) => {
    const trend = d.ownership.institutionalTrend;
    if (!trend) return missing("institutionalTrend fehlt", ["ownership.institutionalTrend"]);
    const score = trend === "accumulating" ? 8 : trend === "flat" ? 5 : 2;
    return { score, reason: `Institutioneller Trend ${trend}`, inputs: ["ownership.institutionalTrend"] };
  },
  short_interest_context: (_m, d, t) => {
    const shortPct = d.shortInterest.pctOfFloat;
    const revs = d.analyst.upgrades3m;
    if (shortPct === null) return missing("shortInterest.pctOfFloat fehlt", ["shortInterest.pctOfFloat"]);
    const squeezeSetup = shortPct >= t.short_interest_high_pct_float && (revs ?? 0) >= t.squeeze_revision_min;
    const score = squeezeSetup ? 8 : shortPct >= t.short_interest_high_pct_float ? 3 : 6;
    return { score, reason: squeezeSetup ? "Hohes SI + positive Revisionen (Squeeze-Setup)" : `Short Float ${(shortPct * 100).toFixed(1)}%`, inputs: ["shortInterest.pctOfFloat", "analyst.upgrades3m"] };
  },
  buyback_vs_dilution: (m, _d, t) => {
    if (m.dilutionOverhang === null) return missing("dilutionOverhang fehlt", ["dilutionOverhang"]);
    const score = m.dilutionOverhang <= 0 ? 8 : m.dilutionOverhang <= t.share_count_growth_red_flag ? 6 : 2;
    return { score, reason: `Netto-Verwaesserung ${(m.dilutionOverhang * 100).toFixed(2)}%`, inputs: ["dilutionOverhang"] };
  },

  financial_fragility: (m, _d, t) => {
    if (m.interestCoverage === null) return missing("interestCoverage fehlt", ["interestCoverage"]);
    const score = m.interestCoverage >= t.risk_interest_coverage_safe ? 8 : m.interestCoverage > 1 ? 5 : 2;
    return { score, reason: `Zinsdeckung ${Math.round(m.interestCoverage * 100) / 100}x`, inputs: ["interestCoverage"] };
  },
  business_model_fragility: (m, _d, t) => {
    if (m.equityRatio === null) return missing("equityRatio fehlt", ["equityRatio"]);
    const score = m.equityRatio >= t.risk_equity_ratio_safe ? 8 : m.equityRatio >= 0.2 ? 5 : 2;
    return { score, reason: `EK-Quote ${Math.round(m.equityRatio * 1000) / 10}%`, inputs: ["equityRatio"] };
  },
  market_fragility: (m, _d, _t) => {
    if (m.valuationZ.evSales === null) return missing("valuationZ.evSales fehlt", ["valuationZ.evSales"]);
    const score = m.valuationZ.evSales < 0.5 ? 7 : m.valuationZ.evSales < 1.0 ? 5 : 2;
    return { score, reason: `Bewertungs-Stress Z ${Math.round(m.valuationZ.evSales * 100) / 100}`, inputs: ["valuationZ.evSales"] };
  },
};
