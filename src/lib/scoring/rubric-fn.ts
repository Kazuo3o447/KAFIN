import type { CompanyDataset } from "@/lib/schemas/dataset";
import type { DerivedMetrics } from "@/lib/research/derived-metrics";
import type { THRESHOLDS } from "@/lib/research/thresholds";

type Thresholds = typeof THRESHOLDS;

export type IndicatorFn = (m: DerivedMetrics, d: CompanyDataset, t: Thresholds) => {
  score: number | null;
  reason: string;
  inputs: string[];
};

/**
 * Smooth monotone piecewise-linear interpolation (P1).
 * points: sorted [{x, y}] where x is input domain, y is score 0..10.
 * Values below/above the first/last x are clamped to the boundary scores.
 */
function scoreLinear(value: number, points: Array<{ x: number; y: number }>): number {
  if (points.length === 0) return 0;
  const sorted = points.slice().sort((a, b) => a.x - b.x);
  if (value <= sorted[0]!.x) return sorted[0]!.y;
  if (value >= sorted[sorted.length - 1]!.x) return sorted[sorted.length - 1]!.y;
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (value >= lo.x && value <= hi.x) {
      const t = (value - lo.x) / (hi.x - lo.x);
      return lo.y + t * (hi.y - lo.y);
    }
  }
  return sorted[sorted.length - 1]!.y;
}

function missing(reason: string, inputs: string[]): { score: null; reason: string; inputs: string[] } {
  return { score: null, reason, inputs };
}

export const INDICATOR_FUNCTIONS: Record<string, IndicatorFn> = {
  revenue_growth_quality: (m, _d, t) => {
    if (m.revenueCagr3y === null) return missing("revenueCagr3y fehlt", ["revenueCagr3y"]);
    const score = scoreLinear(m.revenueCagr3y, [
      { x: -0.1, y: 0 }, { x: 0, y: 2 },
      { x: t.growth_revenue_yoy_strong, y: 7 },
      { x: t.growth_revenue_yoy_excellent, y: 10 },
    ]);
    return { score, reason: `Umsatz-CAGR3Y ${Math.round(m.revenueCagr3y * 1000) / 10}%`, inputs: ["revenueCagr3y"] };
  },
  revenue_cagr_3y: (m, _d, t) => {
    if (m.revenueCagr3y === null) return missing("revenueCagr3y fehlt", ["revenueCagr3y"]);
    const score = scoreLinear(m.revenueCagr3y, [
      { x: -0.1, y: 0 }, { x: 0, y: 1 },
      { x: t.growth_revenue_cagr3y_strong, y: 7 },
      { x: t.growth_revenue_cagr3y_excellent, y: 10 },
    ]);
    return { score, reason: `CAGR3Y ${Math.round(m.revenueCagr3y * 1000) / 10}%`, inputs: ["revenueCagr3y"] };
  },
  /** P1: NRR/ARR zuerst; revenueAcceleration nur als schwacher Fallback (keine Korrelation mit NRR). */
  customer_retention_expansion: (m, d, t) => {
    if (d.saas?.netRevenueRetention !== null && d.saas !== null) {
      const nrr = d.saas.netRevenueRetention!
      const score = scoreLinear(nrr, [
        { x: 0.80, y: 0 }, { x: 0.90, y: 3 }, { x: 1.00, y: 6 }, { x: 1.10, y: 8 }, { x: 1.20, y: 10 },
      ]);
      return { score, reason: `NRR ${Math.round(nrr * 1000) / 10}%`, inputs: ["saas.netRevenueRetention"] };
    }
    if (d.saas?.arr !== null && d.saas !== null) {
      return { score: 6, reason: `ARR vorhanden (${d.saas.arr}), kein NRR-Datum`, inputs: ["saas.arr"] };
    }
    const v = m.revenueAcceleration;
    if (v === null) return missing("Retention-Daten fehlen", ["saas.netRevenueRetention", "saas.arr", "revenueAcceleration"]);
    const score = v > t.growth_acceleration_positive ? 6 : v > 0 ? 4 : 2;
    return { score, reason: `Beschleunigung-Proxy ${Math.round(v * 1000) / 10}pp (kein NRR)`, inputs: ["revenueAcceleration"] };
  },
  /** P1: Segment-Mix-Shift als primärer Marktanteil-Proxy; revenueAcceleration als Fallback. */
  tam_share_gain_evidence: (m, d, t) => {
    const seg = d.segments.find((s) => s.revenueByPeriod.length >= 2);
    if (seg) {
      const first = seg.revenueByPeriod.at(0);
      const last = seg.revenueByPeriod.at(-1);
      if (first && last && first.value !== null && last.value !== null && first.value > 0) {
        const segGrowth = (last.value - first.value) / first.value;
        const score = scoreLinear(segGrowth, [
          { x: -0.1, y: 1 }, { x: 0.10, y: 5 }, { x: 0.30, y: 7 }, { x: 0.50, y: 9 },
        ]);
        return { score, reason: `Segment-Wachstum ${Math.round(segGrowth * 1000) / 10}%`, inputs: ["segments"] };
      }
    }
    const v = m.revenueAcceleration;
    if (v === null) return missing("TAM-Evidenz-Daten fehlen", ["segments", "revenueAcceleration"]);
    const score = v > t.growth_acceleration_positive ? 6 : 4;
    return { score, reason: `TAM-Proxy Beschleunigung ${Math.round(v * 1000) / 10}pp`, inputs: ["revenueAcceleration"] };
  },

  gross_margin_quality: (m, _d, t) => {
    if (m.grossMargin === null) return missing("grossMargin fehlt", ["grossMargin"]);
    const score = scoreLinear(m.grossMargin, [
      { x: 0, y: 1 }, { x: 0.30, y: 4 }, { x: t.gross_margin_strong, y: 8 }, { x: 0.75, y: 10 },
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
    const score = scoreLinear(m.fcfMargin, [
      { x: -0.20, y: 0 }, { x: -0.05, y: 2 }, { x: 0, y: 5 },
      { x: t.fcf_margin_strong, y: 9 }, { x: 0.25, y: 10 },
    ]);
    return { score, reason: `FCF-Marge ${Math.round(m.fcfMargin * 1000) / 10}%`, inputs: ["fcfMargin"] };
  },
  rule_of_40_x_20: (m, _d, t) => {
    if (m.revenueCagr3y === null || m.fcfMargin === null) return missing("Rule-of-40 Inputs fehlen", ["revenueCagr3y", "fcfMargin"]);
    const rule = m.revenueCagr3y * 100 + m.fcfMargin * 100;
    const score = scoreLinear(rule, [
      { x: 0, y: 2 }, { x: t.rule_of_40_floor, y: 8 }, { x: t.rule_of_x_floor, y: 10 },
    ]);
    return { score, reason: `Rule ${Math.round(rule * 10) / 10}`, inputs: ["revenueCagr3y", "fcfMargin"] };
  },

  /**
   * P1: De-korreliertes Moat-Returns-Komposit.
   * Ersetzt moat_source_evidence + quantitative_moat_trace + business_quality_returns
   * durch ein einziges de-korreliertes Signal: ROIC-WACC-Spread + roicAdj + roicFadeRate.
   * Gedeckelt bei moat_quant_returns_cap/10 (z.B. 7/10), damit der KI-Layer (P2) noch Luft hat.
   */
  moat_returns_composite: (m, _d, t) => {
    const inputs: string[] = [];
    let score = 0;

    // Komponente 1: ROIC-WACC-Spread (Hauptsignal, max 4 Punkte)
    if (m.roicWaccSpread !== null) {
      score += scoreLinear(m.roicWaccSpread, [
        { x: -0.10, y: 0 }, { x: 0, y: 1 }, { x: t.roic_wacc_spread_min + 0.05, y: 2.5 }, { x: 0.15, y: 4 },
      ]);
      inputs.push("roicWaccSpread");
    }

    // Komponente 2: Kapital-adjustierter ROIC (max 2.5 Punkte) — de-korreliert durch F&E-Kapitalisierung
    if (m.roicAdj !== null) {
      score += scoreLinear(m.roicAdj, [
        { x: 0, y: 0 }, { x: t.roce_strong, y: 0.5 }, { x: t.roic_strong, y: 1.5 }, { x: 0.25, y: 2.5 },
      ]);
      inputs.push("roicAdj");
    }

    // Komponente 3: ROIC-Fade-Rate (max 2.5 Punkte) — ist der Vorteil stabil oder erodierend?
    if (m.roicFadeRate !== null) {
      score += scoreLinear(m.roicFadeRate, [
        { x: -0.05, y: 0 }, { x: -0.01, y: 0.5 }, { x: 0.01, y: 1.5 }, { x: 0.05, y: 2.5 },
      ]);
      inputs.push("roicFadeRate");
    }

    if (inputs.length === 0) return missing("Moat-Returns-Inputs fehlen", ["roicWaccSpread", "roicAdj", "roicFadeRate"]);

    // Deckel: rein quantitatives Moat-Signal max moat_quant_returns_cap/10 (P2 KI kann höher)
    const cap = t.moat_quant_returns_cap / 10;
    const finalScore = Math.round(Math.min(score, cap) * 10) / 10;
    const spread = m.roicWaccSpread !== null ? `Spread ${Math.round(m.roicWaccSpread * 1000) / 10}%p` : "";
    const adj = m.roicAdj !== null ? `, AdjROIC ${Math.round(m.roicAdj * 1000) / 10}%` : "";
    const fade = m.roicFadeRate !== null ? `, Fade ${Math.round(m.roicFadeRate * 10000) / 100}%p/J` : "";
    return { score: finalScore, reason: `Moat-Returns: ${spread}${adj}${fade}`, inputs };
  },
  /** Backward-compat: für historische Block-Audits und LLM-Prompt-Referenzen. */
  moat_source_evidence: (m, _d, t) => {
    if (m.roicWaccSpread === null) return missing("roicWaccSpread fehlt", ["roicWaccSpread"]);
    const score = m.roicWaccSpread > t.roic_wacc_spread_min ? 8 : 4;
    return { score, reason: `ROIC-WACC ${Math.round(m.roicWaccSpread * 1000) / 10}%p`, inputs: ["roicWaccSpread"] };
  },
  /** Backward-compat. */
  quantitative_moat_trace: (m, _d, t) => {
    if (m.roic === null) return missing("roic fehlt", ["roic"]);
    const score = m.roic >= t.roic_strong ? 9 : m.roic >= t.roce_strong ? 7 : 4;
    return { score, reason: `ROIC ${Math.round(m.roic * 1000) / 10}%`, inputs: ["roic"] };
  },
  durability_trend: (m, _d, t) => {
    if (m.grossMarginStddev === null) return missing("grossMarginStddev fehlt", ["grossMarginStddev"]);
    const score = scoreLinear(m.grossMarginStddev, [
      { x: 0, y: 10 }, { x: t.margin_stability_max_stddev, y: 8 }, { x: 0.10, y: 5 }, { x: 0.20, y: 2 },
    ]);
    return { score, reason: `GM-Stabilität σ=${Math.round(m.grossMarginStddev * 1000) / 10}%p`, inputs: ["grossMarginStddev"] };
  },
  /** Backward-compat. */
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
  news_sentiment_quality: (m, d, t) => {
    const sentScore = d.newsSentiment.score;
    if (sentScore !== null) {
      // Finnhub score: -1 (bearish) to +1 (bullish), normalized: >0.2=bull, <-0.2=bear
      const score = sentScore >= 0.2 ? 8 : sentScore >= 0 ? 6 : sentScore >= -0.2 ? 4 : 2;
      const pct = sentScore >= 0 ? `+${(sentScore * 100).toFixed(0)}` : `${(sentScore * 100).toFixed(0)}`;
      const buzz = d.newsSentiment.articlesInLastWeek !== null ? ` · ${d.newsSentiment.articlesInLastWeek} Artikel/Woche` : "";
      return { score, reason: `News-Sentiment ${pct}%${buzz}`, inputs: ["newsSentiment.score"] };
    }
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
