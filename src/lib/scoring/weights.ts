/**
 * Block-Gewichte aus research.md §9.1. Summe = 100.
 */
export const BLOCK_WEIGHTS = {
  growth_market: 18,
  unit_economics_margins: 14,
  quality_moat: 18,
  valuation: 14,
  capital_discipline_dilution: 12,
  catalysts_revisions_sentiment: 8,
  ownership_smart_money: 8,
  risk_fragility: 8,
} as const;

export type BlockKey = keyof typeof BLOCK_WEIGHTS;

export const BLOCK_LABELS: Record<BlockKey, string> = {
  growth_market: "Wachstum & Marktchance",
  unit_economics_margins: "Unit Economics & Margen",
  quality_moat: "Qualität & Moat",
  valuation: "Bewertung",
  capital_discipline_dilution: "Kapital & Verwässerung",
  catalysts_revisions_sentiment: "Katalysatoren & Sentiment",
  ownership_smart_money: "Ownership & Smart Money",
  risk_fragility: "Risiko & Fragilität",
};

// Sicherheitsnetz: Summe verifizieren.
const _sum = Object.values(BLOCK_WEIGHTS).reduce((a, b) => a + b, 0);
if (_sum !== 100) {
  throw new Error(`BLOCK_WEIGHTS Summe muss 100 sein, ist ${_sum}`);
}
