import { RESEARCH_BLOCK_RUBRIC } from "@/lib/research/rubric";
import { computeScore, type IndicatorScore } from "@/lib/scoring/score";
import { computeGate, type Category } from "@/lib/scoring/gate";
import { THRESHOLDS } from "@/lib/research/thresholds";
import { computeInflectionFlags } from "@/lib/research/inflection";
import { computeOwnershipSignals } from "@/lib/research/ownership-signals";
import { computeEstimatesSignals } from "@/lib/research/estimates-signals";
import { buildFairValueCorridor, detectValuationRegime, type ValuationRegime } from "@/lib/research/valuation";
import { deriveMetricsFromDataset, type DerivedMetrics } from "@/lib/research/derived-metrics";
import { INDICATOR_FUNCTIONS } from "@/lib/scoring/rubric-fn";
import { LENS_PROFILES, type Lens } from "@/lib/scoring/lenses";
import { checkQualityGarpGatekeepers } from "@/lib/scoring/quality-garp";
import { routeSector, type RubricClass } from "@/lib/scoring/sector-router";
import { summarizeSectorBaseline, type SectorBaselineUsed } from "@/lib/research/sector-baselines";
import { deriveComboSignals, deriveConfidenceScore, type ComboSignal } from "@/lib/research/combo-signals";
import { computeAxes, needsAxisReview, type AxisResult } from "@/lib/scoring/axes";
import { evaluateSafetyGate, type SafetyGateResult } from "@/lib/scoring/safety-gate";
import type { CompanyDataset, MarketContext } from "@/lib/schemas/dataset";
import type { BlockKey } from "@/lib/scoring/weights";

export interface LensScoreResult {
  lens: Lens;
  score: number | null;
  gate: "Green" | "Yellow" | "Red";
  category: Category;
  rubricClass: RubricClass;
  notScorableWithStandardRubric: boolean;
  notScorableReason: string | null;
  valuationRegime: ValuationRegime;
  fairValueCorridor: {
    min: number | null;
    median: number | null;
    max: number | null;
  };
  currentVsFairValuePct: number | null;
  expectationsGap: "market_underexpecting" | "fair" | "market_overexpecting";
  inflectionFlags: ReturnType<typeof computeInflectionFlags>;
  ownershipScore: number | null;
  aaqsBinary: {
    score: number;
    total: number;
    passed: boolean;
  } | null;
  stabilityScores: {
    grossMargin: number | null;
    operatingMargin: number | null;
    fcfMargin: number | null;
  };
  coverage: number;
  blockBreakdown: Record<BlockKey, number>;
  indicatorDetails: Record<BlockKey, Array<IndicatorScore & { reason: string; inputs: string[] }>>;
  sectorBaselineUsed: SectorBaselineUsed;
  comboFlags: ComboSignal[];
  confidenceScore: number;
  /** P1: Drei-Achsen-Ergebnisse (Growth · Finance · Moat). KI-Layer in P1 null. */
  axes: AxisResult[];
  /** P1: Ergebnis des Safety-Gate (hard-veto unabhängig vom Score). */
  safetyGate: SafetyGateResult;
  /** P1: true wenn mind. eine Achse >axis_divergence_review Divergenz hat (in P1 immer false). */
  needsAxisReview: boolean;
  /** GARP: false wenn quality_garp-Gates nicht bestanden → intern als emerging_winner bewertet */
  lensFit?: boolean;
  /** GARP: Gates die nicht bestanden (nur quality_garp-Linse) */
  garpFailedGates?: string[];
}

function pickArchetype(
  score: number,
  gate: "Green" | "Yellow" | "Red",
  regime: ValuationRegime,
  axes: AxisResult[],
): Category {
  if (gate === "Red") return "Too Hard";

  // Derive axis scores (combined preferred, fallback quant)
  const getAxis = (key: string): number | null => {
    const a = axes.find((x) => x.axis === key);
    return a?.combined ?? a?.quant.value ?? null;
  };
  const growth = getAxis("growth");
  const finance = getAxis("finance");
  const moat = getAxis("moat");

  // Compounding Engine: all three axes strong
  if (score >= 78 && (growth ?? 0) >= 65 && (finance ?? 0) >= 65 && (moat ?? 0) >= 55 && regime !== "cyclical") {
    return "Rocket"; // maps to "Compounding Engine" display label (Category enum unchanged)
  }

  // Quality Growth: solid across the board
  if (score >= 68) return "Quality Growth";

  // Transitional: at least one growth or moat signal
  if (score >= 55) {
    return "Transitional";
  }

  return "Broken Growth";
}

function buildAaqs(m: DerivedMetrics): LensScoreResult["aaqsBinary"] {
  const checks = [
    m.revenueCagr10y !== null && m.revenueCagr10y >= THRESHOLDS.aaqs_revenue_cagr10y_min,
    m.revenueCagr3yFwd !== null && m.revenueCagr3yFwd >= THRESHOLDS.aaqs_revenue_cagr3y_fwd_min,
    m.ebitCagr10y !== null && m.ebitCagr10y >= THRESHOLDS.aaqs_ebit_cagr10y_min,
    m.ebitCagr3yFwd !== null && m.ebitCagr3yFwd >= THRESHOLDS.aaqs_ebit_cagr3y_fwd_min,
    m.roce !== null && m.roce >= THRESHOLDS.aaqs_roce_min,
    m.netDebtToEbitda !== null && m.netDebtToEbitda <= THRESHOLDS.aaqs_net_debt_to_ebitda_max,
    m.fcfYield !== null && m.fcfYield >= THRESHOLDS.aaqs_earnings_yield_min,
    m.fcfMargin !== null && m.fcfMargin >= THRESHOLDS.aaqs_fcf_margin_min,
    m.operatingMarginStddev !== null && m.operatingMarginStddev <= THRESHOLDS.aaqs_margin_stability_max_stddev,
    m.dilutionOverhang !== null && m.dilutionOverhang <= THRESHOLDS.aaqs_dilution_max,
  ];
  const total = checks.length;
  const score = checks.filter(Boolean).length;
  return { score, total, passed: score >= 7 };
}

export function scoreCompany(dataset: CompanyDataset, lens: Lens, marketContext?: MarketContext): LensScoreResult {
  const route = routeSector(dataset);
  if (route.notScorableWithStandardRubric) {
    const sectorBaselineUsed = summarizeSectorBaseline(dataset.identity.sector, dataset.identity.industry, null);
    const comboFlags = deriveComboSignals({
      key_metrics: {} as any,
      category: "Too Hard",
      gate: "Red",
      confidence: "low",
      score_breakdown: {
        growth_market: 0,
        unit_economics_margins: 0,
        quality_moat: 0,
        valuation: 0,
        capital_discipline_dilution: 0,
        catalysts_revisions_sentiment: 0,
        risk_fragility: 0,
      },
      regime: null,
      timing_score: null,
      business_model_type: route.rubricClass,
    });
    return {
      lens,
      score: null,
      gate: "Red",
      category: "Too Hard",
      rubricClass: route.rubricClass,
      notScorableWithStandardRubric: true,
      notScorableReason: route.notScorableReason,
      valuationRegime: "cyclical",
      fairValueCorridor: { min: null, median: null, max: null },
      currentVsFairValuePct: null,
      expectationsGap: "fair",
      inflectionFlags: {
        grossMarginTurnedPositive: false,
        operatingMarginTurnedPositive: false,
        fcfTurnedPositive: false,
        lossNarrowingTowardBreakeven: false,
        revenueAccelerationPositive: false,
        revisionMomentumPositive: false,
      },
      ownershipScore: null,
      aaqsBinary: null,
      stabilityScores: {
        grossMargin: null,
        operatingMargin: null,
        fcfMargin: null,
      },
      coverage: 0,
      blockBreakdown: {
        growth_market: 0,
        unit_economics_margins: 0,
        quality_moat: 0,
        valuation: 0,
        capital_discipline_dilution: 0,
        catalysts_revisions_sentiment: 0,
        ownership_smart_money: 0,
        risk_fragility: 0,
      },
      indicatorDetails: {
        growth_market: [],
        unit_economics_margins: [],
        quality_moat: [],
        valuation: [],
        capital_discipline_dilution: [],
        catalysts_revisions_sentiment: [],
        ownership_smart_money: [],
        risk_fragility: [],
      },
      sectorBaselineUsed,
      comboFlags,
      confidenceScore: 0,
      axes: [],
      safetyGate: { status: "ok", reasons: [] },
      needsAxisReview: false,
    };
  }

  const m = deriveMetricsFromDataset(dataset);

  // ---------------------------------------------------------------------------
  // Quality-GARP Phase-1-Gatekeeper: bei Durchfall Reroute zu emerging_winner
  // Die Gatekeeper sind linsen-intern: kein Score 0, sondern lens_fit: false.
  // ---------------------------------------------------------------------------
  let effectiveLens: Lens = lens;
  let lensFit: boolean | undefined;
  let garpFailedGates: string[] | undefined;
  if (lens === "quality_garp") {
    // altman_z kommt aus dataset.forensics (nicht in DerivedMetrics)
    const altmanZ = (dataset as unknown as { forensics?: { altmanZ?: number | null } })
      .forensics?.altmanZ ?? null;
    const gatekeeperResult = checkQualityGarpGatekeepers(m, altmanZ);
    lensFit = gatekeeperResult.passed;
    if (!gatekeeperResult.passed) {
      garpFailedGates = gatekeeperResult.failedGates;
      effectiveLens = "emerging_winner"; // Reroute: intern als emerging_winner bewerten
    }
  }
  const estimatesSignals = computeEstimatesSignals(dataset);
  const ownership = computeOwnershipSignals(dataset);
  const inflection = computeInflectionFlags(dataset, estimatesSignals.revisionsBalance, estimatesSignals.sue);
  const regime = detectValuationRegime(dataset, m);
  const fairValue = buildFairValueCorridor(dataset, m, regime);
  const sectorBaselineUsed = summarizeSectorBaseline(dataset.identity.sector, dataset.identity.industry, m);

  const indicatorDetails = {} as LensScoreResult["indicatorDetails"];
  const blocks = {} as Record<BlockKey, IndicatorScore[]>;

  for (const [blockKey, block] of Object.entries(RESEARCH_BLOCK_RUBRIC) as Array<[BlockKey, (typeof RESEARCH_BLOCK_RUBRIC)[BlockKey]]>) {
    const indicators: Array<IndicatorScore & { reason: string; inputs: string[] }> = [];
    for (const indicator of block.indicators) {
      const fn = INDICATOR_FUNCTIONS[indicator.key];
      if (!fn) {
        indicators.push({ key: indicator.key, value: null, reason: "Indikatorfunktion fehlt", inputs: [indicator.key] });
        continue;
      }
      const out = fn(m, dataset, THRESHOLDS);
      indicators.push({ key: indicator.key, value: out.score, reason: out.reason, inputs: out.inputs, rationale: out.reason });
    }
    indicatorDetails[blockKey] = indicators;
    blocks[blockKey] = indicators;
  }

  const score = computeScore(blocks);
  const axes = computeAxes(score.blocks);
  const blockBreakdown = Object.fromEntries(
    (Object.keys(score.blocks) as BlockKey[]).map((k) => [k, Math.round(score.blocks[k].weighted * 100) / 100]),
  ) as Record<BlockKey, number>;

  const profile = LENS_PROFILES[effectiveLens];
  const hardBlockers: string[] = [];
  if (profile.gates.requireStableProfitability && regime === "pre_profit") {
    hardBlockers.push("Unzureichende stabile Profitabilität für Quality-Linse");
  }
  if ((m.cashRunwayMonths ?? 999) < THRESHOLDS.cash_runway_hard_blocker_months) {
    hardBlockers.push("Cash Runway unter Hard-Blocker-Schwelle");
  }
  if (effectiveLens === "emerging_winner" && ownership.shortRisk && !ownership.squeezeSetup) {
    hardBlockers.push("Hohes Short-Interesse ohne positives Setup");
  }

  const safetyGate = evaluateSafetyGate(m, hardBlockers);

  const gate = computeGate({
    scoreTotal: score.total,
    coverage: score.coverage,
    confidence: score.coverage >= THRESHOLDS.coverage_floor ? "high" : "medium",
    category: pickArchetype(score.total, "Yellow", regime, axes),
    hardBlockers,
  });

  const category = pickArchetype(score.total, gate, regime, axes);
  const comboFlags = deriveComboSignals({
    key_metrics: m as any,
    category,
    gate,
    confidence: score.coverage >= THRESHOLDS.coverage_floor ? "high" : "medium",
    score_breakdown: blockBreakdown,
    fair_value: null,
    timing_score: null,
    regime: marketContext?.regime ?? null,
    business_model_type: route.rubricClass,
  });
  const confidenceScore = deriveConfidenceScore({
    coverage: score.coverage,
    confidence: score.coverage >= THRESHOLDS.coverage_floor ? "high" : "medium",
    hardBlockers,
    sectorBaseline: sectorBaselineUsed,
    comboSignals: comboFlags,
    scoreTrend: null,
  });

  return {
    lens,
    score: score.total,
    gate,
    category,
    rubricClass: route.rubricClass,
    notScorableWithStandardRubric: false,
    notScorableReason: null,
    valuationRegime: regime,
    fairValueCorridor: {
      min: fairValue.min,
      median: fairValue.median,
      max: fairValue.max,
    },
    currentVsFairValuePct: fairValue.currentVsFairValuePct,
    expectationsGap: fairValue.expectationsGap,
    inflectionFlags: inflection,
    ownershipScore: ownership.ownershipScore,
    aaqsBinary: lens === "quality_compounder" || lens === "quality_garp" ? buildAaqs(m) : null,
    stabilityScores: {
      grossMargin: m.grossMarginStddev,
      operatingMargin: m.operatingMarginStddev,
      fcfMargin: m.fcfMarginStddev,
    },
    coverage: score.coverage,
    blockBreakdown,
    indicatorDetails,
    sectorBaselineUsed,
    comboFlags,
    confidenceScore,
    axes,
    safetyGate,
    needsAxisReview: needsAxisReview(axes),
    lensFit,
    garpFailedGates,
  };
}
