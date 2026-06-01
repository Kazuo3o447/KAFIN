import type { BlockKey } from "@/lib/scoring/weights";

export const SCORING_DIMENSIONS = [
  "growth_market",
  "unit_economics_margins",
  "quality_moat",
  "valuation",
  "capital_discipline_dilution",
  "catalysts_revisions_sentiment",
  "ownership_smart_money",
  "risk_fragility",
] as const;

export type ScoringDimension = (typeof SCORING_DIMENSIONS)[number];

export const DIMENSION_TO_BLOCK: Record<ScoringDimension, BlockKey> = {
  growth_market: "growth_market",
  unit_economics_margins: "unit_economics_margins",
  quality_moat: "quality_moat",
  valuation: "valuation",
  capital_discipline_dilution: "capital_discipline_dilution",
  catalysts_revisions_sentiment: "catalysts_revisions_sentiment",
  ownership_smart_money: "ownership_smart_money",
  risk_fragility: "risk_fragility",
};

export const TIMING_AXIS_POLICY = {
  isOrthogonal: true,
  note: "Timing and market regime never alter the fundamental score block values.",
} as const;
