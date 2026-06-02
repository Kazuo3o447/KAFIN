import type { BlockKey } from "@/lib/scoring/weights";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type Lens = "quality_compounder" | "emerging_winner" | "quality_garp";

export interface GateRules {
  minScoreGreen: number;
  requireStableProfitability: boolean;
}

export interface LensProfile {
  blockWeights: Record<BlockKey, number>;
  indicatorSet: string[];
  valuationPreference: Array<"pre_profit" | "cyclical" | "mature">;
  gates: GateRules;
}

export const LENS_PROFILES: Record<Lens, LensProfile> = {
  quality_compounder: {
    blockWeights: {
      growth_market: THRESHOLDS.lens_quality_weight_growth_market,
      unit_economics_margins: THRESHOLDS.lens_quality_weight_unit_economics_margins,
      quality_moat: THRESHOLDS.lens_quality_weight_quality_moat,
      valuation: THRESHOLDS.lens_quality_weight_valuation,
      capital_discipline_dilution: THRESHOLDS.lens_quality_weight_capital_discipline_dilution,
      catalysts_revisions_sentiment: THRESHOLDS.lens_quality_weight_catalysts_revisions_sentiment,
      ownership_smart_money: THRESHOLDS.lens_quality_weight_ownership_smart_money,
      risk_fragility: THRESHOLDS.lens_quality_weight_risk_fragility,
    },
    indicatorSet: [
      "revenue_growth_quality",
      "revenue_cagr_3y",
      "gross_margin_quality",
      "operating_leverage",
      "fcf_efficiency",
      "moat_returns_composite",
      "durability_trend",
      "growth_adjusted_multiple",
      "insider_cluster_buying",
      "institutional_flow_trend",
      "short_interest_context",
      "share_count_dilution",
      "sbc_burden",
      "financial_fragility",
    ],
    valuationPreference: ["mature", "cyclical", "pre_profit"],
    gates: {
      minScoreGreen: THRESHOLDS.lens_quality_min_score_green,
      requireStableProfitability: true,
    },
  },
  emerging_winner: {
    blockWeights: {
      growth_market: THRESHOLDS.lens_emerging_weight_growth_market,
      unit_economics_margins: THRESHOLDS.lens_emerging_weight_unit_economics_margins,
      quality_moat: THRESHOLDS.lens_emerging_weight_quality_moat,
      valuation: THRESHOLDS.lens_emerging_weight_valuation,
      capital_discipline_dilution: THRESHOLDS.lens_emerging_weight_capital_discipline_dilution,
      catalysts_revisions_sentiment: THRESHOLDS.lens_emerging_weight_catalysts_revisions_sentiment,
      ownership_smart_money: THRESHOLDS.lens_emerging_weight_ownership_smart_money,
      risk_fragility: THRESHOLDS.lens_emerging_weight_risk_fragility,
    },
    indicatorSet: [
      "revenue_growth_quality",
      "customer_retention_expansion",
      "rule_of_40_x_20",
      "fundamental_catalysts",
      "estimate_revisions",
      "insider_cluster_buying",
      "institutional_flow_trend",
      "short_interest_context",
      "share_count_dilution",
      "balance_sheet_runway",
      "financial_fragility",
    ],
    valuationPreference: ["pre_profit", "mature", "cyclical"],
    gates: {
      minScoreGreen: THRESHOLDS.lens_emerging_min_score_green,
      requireStableProfitability: false,
    },
  },
  quality_garp: {
    blockWeights: {
      growth_market: THRESHOLDS.lens_garp_weight_growth_market,
      unit_economics_margins: THRESHOLDS.lens_garp_weight_unit_economics_margins,
      quality_moat: THRESHOLDS.lens_garp_weight_quality_moat,
      valuation: THRESHOLDS.lens_garp_weight_valuation,
      capital_discipline_dilution: THRESHOLDS.lens_garp_weight_capital_discipline_dilution,
      catalysts_revisions_sentiment: THRESHOLDS.lens_garp_weight_catalysts_revisions_sentiment,
      ownership_smart_money: THRESHOLDS.lens_garp_weight_ownership_smart_money,
      risk_fragility: THRESHOLDS.lens_garp_weight_risk_fragility,
    },
    indicatorSet: [
      "revenue_growth_quality",
      "revenue_cagr_3y",
      "gross_margin_quality",
      "fcf_efficiency",
      "moat_returns_composite",
      "growth_adjusted_multiple",
      "garp_reverse_dcf_asymmetry",
      "garp_fcf_peg",
      "garp_capex_ocf",
      "garp_margin_momentum",
      "share_count_dilution",
      "financial_fragility",
    ],
    valuationPreference: ["mature", "cyclical", "pre_profit"],
    gates: {
      minScoreGreen: THRESHOLDS.lens_garp_min_score_green,
      requireStableProfitability: true,
    },
  },
};

for (const profile of Object.values(LENS_PROFILES)) {
  const sum = Object.values(profile.blockWeights).reduce((s, v) => s + v, 0);
  if (sum !== 100) {
    throw new Error(`Lens block weights must sum to 100, got ${sum}`);
  }
}
