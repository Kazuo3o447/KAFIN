import type { KeyMetrics, Report } from "@/lib/schemas/report";
import { BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";
import type { Category, Confidence } from "@/lib/scoring/gate";
import { THRESHOLDS } from "./thresholds";

export interface ResearchSignalInput {
  scoreTotal: number;
  coverage: number;
  confidence: Confidence;
  keyMetrics?: KeyMetrics;
  scoreBreakdown: Record<BlockKey, number>;
  hardBlockers: string[];
}

export interface ResearchSignals {
  category: Category;
  redFlags: string[];
  hardBlockers: string[];
}

interface MoatBlockResult {
  indicators: Array<{ name: string; score: number | null; rationale: string; sourceIdx: number | null }>;
  red_flags?: string[];
  moat_rating?: string | null;
  moat_evidence?: string[];
  moat_threats?: string[];
}

function blockPct(scoreBreakdown: Record<BlockKey, number>, block: BlockKey): number {
  const max = BLOCK_WEIGHTS[block];
  return max > 0 ? (scoreBreakdown[block] ?? 0) / max : 0;
}

function isHigh(value: number | null | undefined, threshold: number): boolean {
  return typeof value === "number" && value > threshold;
}

function isLow(value: number | null | undefined, threshold: number): boolean {
  return typeof value === "number" && value < threshold;
}

export function deriveResearchSignals(input: ResearchSignalInput): ResearchSignals {
  const km = input.keyMetrics;
  const redFlags = new Set<string>();
  const hardBlockers = new Set(input.hardBlockers);

  if (input.coverage < 0.4) redFlags.add("Daten-Coverage < 40%.");
  if (input.confidence === "low") redFlags.add("Niedrige Daten-Confidence.");
  if (isHigh(km?.share_count_growth_yoy, THRESHOLDS.share_count_growth_red_flag)) redFlags.add("Share Count Growth > 3% p.a.");
  if (isHigh(km?.sbc_to_revenue, THRESHOLDS.sbc_to_revenue_red_flag)) redFlags.add("SBC / Revenue > 10%.");
  if (isHigh(km?.net_debt_to_ebitda, THRESHOLDS.net_debt_to_ebitda_red_flag)) redFlags.add("Net Debt / EBITDA > 3.");
  if (isLow(km?.fcf_margin, 0)) redFlags.add("FCF-Marge negativ.");
  if (typeof km?.rule_of_40 === "number" && km.rule_of_40 < THRESHOLDS.rule_of_40_floor) redFlags.add("Rule of 40 unter 40.");

  // Phase A: Forensic red flags
  if (typeof km?.piotroski_f === "number" && km.piotroski_f <= THRESHOLDS.piotroski_weak) {
    redFlags.add(`Schwacher Piotroski F-Score: ${km.piotroski_f}/9.`);
  }
  if (typeof km?.altman_z === "number" && km.altman_z < THRESHOLDS.altman_z_safe && km.altman_z >= THRESHOLDS.altman_z_distress) {
    redFlags.add(`Altman Z im Graubereich: ${km.altman_z.toFixed(2)}.`);
  }
  if (typeof km?.roic_wacc_spread === "number" && km.roic_wacc_spread < THRESHOLDS.roic_wacc_spread_min) {
    redFlags.add(`ROIC unter WACC (Spread: ${(km.roic_wacc_spread * 100).toFixed(1)} Pp.).`);
  }
  // Margin deterioration: trend negative + high stddev
  if (typeof km?.gross_margin_trend === "number" && km.gross_margin_trend < -0.02) {
    redFlags.add("Bruttomarge im Abwärtstrend (>2 Pp./Jahr).");
  }
  if (typeof km?.fcf_margin_trend === "number" && km.fcf_margin_trend < -0.03) {
    redFlags.add("FCF-Marge im Abwärtstrend (>3 Pp./Jahr).");
  }

  if (isLow(km?.fcf_margin, 0) && isHigh(km?.net_debt_to_ebitda, THRESHOLDS.net_debt_to_ebitda_red_flag)) {
    hardBlockers.add("Bilanzstress + negativer FCF.");
  }
  if (isHigh(km?.share_count_growth_yoy, THRESHOLDS.share_count_growth_extreme) && isLow(km?.fcf_margin, 0)) {
    hardBlockers.add("Extreme Verwaesserung ohne klaren Pfad zur FCF-Deckung.");
  }

  // Phase A: Hard blockers from forensic scores
  if (typeof km?.cash_runway_months === "number" && km.cash_runway_months < THRESHOLDS.cash_runway_hard_blocker_months) {
    hardBlockers.add(`Cash Runway < ${THRESHOLDS.cash_runway_hard_blocker_months} Monate (${km.cash_runway_months.toFixed(0)} Mo.).`);
  }
  if (typeof km?.altman_z === "number" && km.altman_z < THRESHOLDS.altman_z_distress) {
    hardBlockers.add(`Altman Z im Distress-Bereich: ${km.altman_z.toFixed(2)} (< ${THRESHOLDS.altman_z_distress}).`);
  }
  if (typeof km?.beneish_m === "number" && km.beneish_m > THRESHOLDS.beneish_m_manipulation) {
    hardBlockers.add(`Beneish M-Score indiziert Earnings-Manipulation: ${km.beneish_m.toFixed(2)}.`);
  }

  const growth = blockPct(input.scoreBreakdown, "growth_market");
  const unitEconomics = blockPct(input.scoreBreakdown, "unit_economics_margins");
  const quality = blockPct(input.scoreBreakdown, "quality_moat");
  const valuation = blockPct(input.scoreBreakdown, "valuation");
  const capital = blockPct(input.scoreBreakdown, "capital_discipline_dilution");
  const risk = blockPct(input.scoreBreakdown, "risk_fragility");

  let category: Category = "Transitional";
  const highDilution = isHigh(km?.sbc_to_revenue, 0.1) || isHigh(km?.share_count_growth_yoy, 0.03);
  const strongOrVisibleGrowth = isHigh(km?.revenue_growth_yoy, 0.15) || growth >= 0.6;
  const brokenGrowth =
    (typeof km?.revenue_growth_yoy === "number" && km.revenue_growth_yoy < 0.08 && growth < 0.45) ||
    (growth < 0.35 && unitEconomics < 0.5);
  const hypeRisk =
    input.scoreTotal >= 65 &&
    isLow(km?.fcf_margin, 0) &&
    (valuation < 0.55 || risk < 0.55 || isHigh(km?.beta, 1.8));

  if (hardBlockers.size > 0 || input.coverage < 0.35 || input.confidence === "low") {
    category = "Too Hard";
  } else if (capital < 0.5 && highDilution && strongOrVisibleGrowth) {
    category = "Dilution Trap";
  } else if (hypeRisk) {
    category = "Hype/Risk";
  } else if (brokenGrowth) {
    category = input.scoreTotal < 40 ? "Ignore" : "Broken Growth";
  } else if (input.scoreTotal < 40) {
    category = "Ignore";
  } else if (input.scoreTotal >= 80 && (isHigh(km?.revenue_growth_yoy, 0.35) || growth >= 0.75)) {
    category = "Rocket";
  } else if (input.scoreTotal >= 65 && quality >= 0.55 && (unitEconomics >= 0.5 || !isLow(km?.fcf_margin, 0))) {
    category = "Quality Growth";
  }

  return {
    category,
    redFlags: Array.from(redFlags),
    hardBlockers: Array.from(hardBlockers),
  };
}

function normalizeMoatRating(value: string | null | undefined): Report["moat_assessment"]["rating"] | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (normalized === "wide" || normalized === "wide moat") return "Wide";
  if (normalized === "narrow" || normalized === "narrow moat") return "Narrow";
  if (normalized === "emerging" || normalized === "emerging moat") return "Emerging";
  if (normalized === "no moat") return "No Moat";
  if (normalized === "negative trend" || normalized === "negative moat trend") return "Negative Trend";
  if (normalized === "unknown") return "Unknown";
  return null;
}

export function buildMoatAssessment(
  qualityBlock: MoatBlockResult | undefined,
  sourceMap: Map<number, { url: string }>,
): Report["moat_assessment"] {
  if (!qualityBlock) return { rating: "Unknown", sources: [], evidence: [], threats: [] };

  const numericScores = qualityBlock.indicators
    .map((i) => i.score)
    .filter((score): score is number => typeof score === "number");
  const avg = numericScores.length > 0 ? numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length : null;
  const redFlags = qualityBlock.red_flags ?? [];

  let rating = normalizeMoatRating(qualityBlock.moat_rating);
  if (!rating) {
    if (redFlags.some((flag) => /commoditi|copy|competition|wettbewerb|ki|open source/i.test(flag))) {
      rating = "Negative Trend";
    } else if (avg === null) {
      rating = "Unknown";
    } else if (avg >= 8.5) {
      rating = "Wide";
    } else if (avg >= 7) {
      rating = "Narrow";
    } else if (avg >= 5.5) {
      rating = "Emerging";
    } else if (avg >= 3.5) {
      rating = "No Moat";
    } else {
      rating = "Negative Trend";
    }
  }

  const evidence =
    qualityBlock.moat_evidence && qualityBlock.moat_evidence.length > 0
      ? qualityBlock.moat_evidence
      : qualityBlock.indicators
          .filter((i) => (i.score ?? 0) >= 6 && i.rationale)
          .map((i) => `${i.name}: ${i.rationale}`)
          .slice(0, 5);

  const threats =
    qualityBlock.moat_threats && qualityBlock.moat_threats.length > 0
      ? qualityBlock.moat_threats
      : [
          ...redFlags,
          ...qualityBlock.indicators
            .filter((i) => typeof i.score === "number" && i.score <= 4 && i.rationale)
            .map((i) => `${i.name}: ${i.rationale}`),
        ].slice(0, 6);

  const sourceIds = new Set(
    qualityBlock.indicators
      .map((i) => i.sourceIdx)
      .filter((idx): idx is number => typeof idx === "number"),
  );
  const sources = Array.from(sourceIds)
    .map((idx) => sourceMap.get(idx)?.url)
    .filter((url): url is string => Boolean(url));

  return { rating, sources, evidence, threats };
}
