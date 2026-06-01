/**
 * Zod-Schema für den Research-Report.
 * 1:1 Abbild von research.md §21.
 */
import { z } from "zod";

export const CategorySchema = z.enum([
  "Rocket",
  "Quality Growth",
  "Transitional",
  "Hype/Risk",
  "Dilution Trap",
  "Broken Growth",
  "Too Hard",
  "Ignore",
]);
export const GateSchema = z.enum(["Green", "Yellow", "Red"]);
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export const LensSchema = z.enum(["quality_compounder", "emerging_winner"]);
export const RegimeSchema = z.enum(["risk_on", "neutral", "risk_off"]);
export const ScoreTrendSchema = z.enum(["up", "down", "flat"]);
export const RubricClassSchema = z.enum([
  "industrial_software",
  "financials",
  "reit",
  "insurance",
  "biotech_pre_revenue",
  "commodity_cyclical",
]);
export const MoatRatingSchema = z.enum([
  "Wide",
  "Narrow",
  "Emerging",
  "No Moat",
  "Negative Trend",
  "Unknown",
]);

const numOrNull = z.number().nullable().default(null);

export const KeyMetricsSchema = z.object({
  // Core metrics (original 16)
  revenue_growth_yoy: numOrNull,
  revenue_cagr_3y: numOrNull,
  gross_margin: numOrNull,
  operating_margin: numOrNull,
  fcf_margin: numOrNull,
  roic: numOrNull,
  rule_of_40: numOrNull,
  rule_of_x: numOrNull,
  share_count_growth_yoy: numOrNull,
  sbc_to_revenue: numOrNull,
  net_debt_to_ebitda: numOrNull,
  beta: numOrNull,
  ntm_pe: numOrNull,
  ev_sales: numOrNull,
  ev_gross_profit: numOrNull,
  peg: numOrNull,

  // Phase A: Forensic scores (research.md §38)
  piotroski_f: numOrNull,
  mohanram_g: numOrNull,
  altman_z: numOrNull,
  beneish_m: numOrNull,

  // Phase A: Cash runway
  cash_runway_months: numOrNull,

  // Phase A: WACC / ROIC spread
  wacc: numOrNull,
  roic_wacc_spread: numOrNull,

  // Phase A: Margin trends (linear slope per year, as decimal ratio)
  gross_margin_trend: numOrNull,    // positive = improving
  operating_margin_trend: numOrNull,
  fcf_margin_trend: numOrNull,

  // Phase A: Margin stability (stddev over last 3-5 years)
  gross_margin_stddev: numOrNull,
  operating_margin_stddev: numOrNull,
  fcf_margin_stddev: numOrNull,

  // Phase D (pre-allocated): Analyst & insider
  analyst_upgrades_3m: numOrNull,
  analyst_downgrades_3m: numOrNull,
  insider_net_activity_usd: numOrNull,
  earnings_surprise_pct: numOrNull,
  net_revenue_retention: numOrNull,  // SaaS NRR
  arr_growth_yoy: numOrNull,         // SaaS ARR growth

  // v2: Applicability- and trend-sensitive metrics
  rule_of_20: numOrNull,
  revenue_growth_latest_q: numOrNull,
  gross_margin_latest_q: numOrNull,
  operating_margin_latest_q: numOrNull,
  fcf_margin_latest_q: numOrNull,
  revenue_growth_ttm: numOrNull,
  gross_margin_ttm: numOrNull,
  operating_margin_ttm: numOrNull,
  fcf_margin_ttm: numOrNull,
  gross_margin_yoy_delta_bps: numOrNull,
  operating_margin_yoy_delta_bps: numOrNull,
  fcf_margin_yoy_delta_bps: numOrNull,
  active_subscribers_growth: numOrNull,
  order_frequency: numOrNull,
  contribution_margin: numOrNull,
  cac_payback: numOrNull,
  fcf_margin_after_sbc: numOrNull,
  gmv_growth: numOrNull,
  take_rate: numOrNull,
  buyer_seller_growth: numOrNull,
  liquidity: numOrNull,
  inventory_turns: numOrNull,
  return_rate: numOrNull,
  fulfillment_cost_ratio: numOrNull,
  roe: numOrNull,
  rote: numOrNull,
  cet1: numOrNull,
  nim: numOrNull,
  credit_losses: numOrNull,
  deposit_beta: numOrNull,
});
export type KeyMetrics = z.infer<typeof KeyMetricsSchema>;

export const ScoreBreakdownSchema = z.object({
  growth_market: z.number().min(0).max(18),
  unit_economics_margins: z.number().min(0).max(14),
  quality_moat: z.number().min(0).max(18),
  valuation: z.number().min(0).max(14),
  capital_discipline_dilution: z.number().min(0).max(12),
  // Keep max=12 for backward compatibility with historical reports/tests.
  catalysts_revisions_sentiment: z.number().min(0).max(12),
  ownership_smart_money: z.number().min(0).max(8).default(0),
  // Keep max=12 for backward compatibility with historical reports/tests.
  risk_fragility: z.number().min(0).max(12),
});

export const BlockKeySchema = z.enum([
  "growth_market",
  "unit_economics_margins",
  "quality_moat",
  "valuation",
  "capital_discipline_dilution",
  "catalysts_revisions_sentiment",
  "ownership_smart_money",
  "risk_fragility",
]);

export const BlockIndicatorSchema = z.object({
  name: z.string(),
  score: z.number().nullable(),
  rationale: z.string().default(""),
  reason: z.string().default(""),
  inputs: z.array(z.string()).default([]),
  sourceIdx: z.array(z.number().int().nonnegative()).default([]),
  scoreType: z.enum(["deterministic", "llm_judgment", "hybrid"]).default("llm_judgment"),
  scoreValid: z.boolean().default(true),
  rationaleValid: z.boolean().default(true),
  sourceSupportStatus: z.enum(["supported", "unsupported", "not_checked", "internal_metric"]).default("not_checked"),
  metricRefs: z.array(z.string()).default([]),
  missingMetricRefs: z.array(z.string()).default([]),
  dataStatus: z
    .enum(["valid", "missing_required_data", "not_applicable", "unsupported_claim", "conflicting_data", "stale_data"])
    .default("valid"),
  invalidSourceRefs: z.array(z.string()).default([]),
});

export const BlockAuditSchema = z.object({
  block: BlockKeySchema,
  indicators: z.array(BlockIndicatorSchema).default([]),
  confidence: ConfidenceSchema.default("medium"),
  hard_blockers: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
});
export type BlockAudit = z.infer<typeof BlockAuditSchema>;

export const MoatAssessmentSchema = z.object({
  rating: MoatRatingSchema,
  sources: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  threats: z.array(z.string()).default([]),
});

export const SourceSchema = z.object({
  idx: z.number().int().nonnegative(),
  url: z.string().url().or(z.string().min(1)),
  title: z.string().optional(),
  class: z.enum(["A", "A-", "B", "B-", "C", "D", "E"]).default("C"),
});

const MarketContextSummarySchema = z.object({
  as_of: z.string().default(""),
  regime: RegimeSchema.nullable().default(null),
  breadth_pct_above_ma200: numOrNull,
  index_vs_ma200_pct: numOrNull,
  vix: numOrNull,
  vix_percentile_1y: numOrNull,
  high_yield_spread: numOrNull,
  yield_curve_10y2y: numOrNull,
});

const SectorBaselineUsedSchema = z.object({
  id: z.string(),
  label: z.string(),
  sector: z.string(),
  reference: z.object({
    revenueGrowthMin: numOrNull,
    grossMarginMin: numOrNull,
    fcfMarginMin: numOrNull,
    roicMin: numOrNull,
    valuationCeiling: numOrNull,
  }),
  signals: z.array(z.string()).default([]),
});

const ComboSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  active: z.boolean(),
  weight: z.number(),
  description: z.string(),
});

const AssumptionEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.enum(["ratio", "years"]),
  rationale: z.string(),
  kind: z.literal("assumption"),
});

export const ReportSchema = z.object({
  ticker: z.string().min(1),
  company_name: z.string().default(""),
  isin: z.string().default(""),
  exchange: z.string().default(""),
  sector: z.string().default(""),
  industry: z.string().default(""),
  research_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: CategorySchema,
  growth_research_score: z.number().min(0).max(100).nullable().default(null),
  gate: GateSchema,
  confidence: ConfidenceSchema,
  lens: LensSchema.default("quality_compounder"),
  rubric_class: RubricClassSchema.default("industrial_software"),
  not_scorable_with_standard_rubric: z.boolean().default(false),
  not_scorable_reason: z.string().nullable().default(null),
  reporting_currency: z.string().default("USD"),
  gaap_vs_adjusted: z
    .object({
      gaap: z.record(z.string(), z.number().nullable()).default({}),
      adjusted: z.record(z.string(), z.number().nullable()).default({}),
      sbcAdjustmentRatio: z.number().default(1),
    })
    .default({ gaap: {}, adjusted: {}, sbcAdjustmentRatio: 1 }),
  thesis_summary: z.string().default(""),
  bull_case: z.array(z.string()).default([]),
  bear_case: z.array(z.string()).default([]),
  key_metrics: KeyMetricsSchema,
  score_breakdown: ScoreBreakdownSchema,
  block_audits: z.array(BlockAuditSchema).default([]),
  moat_assessment: MoatAssessmentSchema,
  catalysts: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  hard_blockers: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  falsification_tests: z.array(z.string()).default([]),
  source_list: z.array(SourceSchema).default([]),
  handoff_to_trade_engine: z.boolean().default(false),
  market_context: MarketContextSummarySchema.nullable().default(null),
  sector_baseline_used: SectorBaselineUsedSchema.nullable().default(null),
  combo_flags: z.array(ComboSignalSchema).default([]),
  confidence_score: numOrNull,
  score_trend: ScoreTrendSchema.nullable().default(null),
  assumptions: z.array(AssumptionEntrySchema).default([]),
  score_interpretation: z
    .object({
      mode: z.enum(["as_was", "rescored_current_thresholds"]).default("as_was"),
      label: z.string().default("As-Was"),
      thresholdSetVersion: z.string().default("unknown"),
      assumptionsVersion: z.string().default("unknown"),
    })
    .default({
      mode: "as_was",
      label: "As-Was",
      thresholdSetVersion: "unknown",
      assumptionsVersion: "unknown",
    }),
  audit_snapshot: z
    .object({
      codeVersion: z.string().default("dev"),
      thresholdSetVersion: z.string().default("unknown"),
      assumptionsVersion: z.string().default("unknown"),
      dataSnapshotId: z.string().default(""),
      providerVersions: z.record(z.string(), z.string()).default({}),
      runAt: z.string().default(""),
    })
    .default({
      codeVersion: "dev",
      thresholdSetVersion: "unknown",
      assumptionsVersion: "unknown",
      dataSnapshotId: "",
      providerVersions: {},
      runAt: "",
    }),
  run_integrity: z
    .object({
      incomplete_due_to_technical_fetch_errors: z.boolean().default(false),
      retry_recommended: z.boolean().default(false),
      banner: z.string().default(""),
      fetch_statuses: z
        .array(
          z.object({
            capability: z.string(),
            status: z.enum(["available", "not_reported", "not_applicable", "fetch_failed", "rate_limited", "stale"]),
            providerTried: z.array(z.string()).default([]),
            providerUsed: z.string().nullable().default(null),
            retries: z.number().int().nonnegative().default(0),
            errors: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    })
    .default({
      incomplete_due_to_technical_fetch_errors: false,
      retry_recommended: false,
      banner: "",
      fetch_statuses: [],
    }),

  // v2: model trace + audit integrity
  models: z
    .object({
      extract: z.string().nullable().default(null),
      scoring: z.record(z.string(), z.string()).default({}),
      summary: z.string().nullable().default(null),
      red_team: z.string().nullable().default(null),
      verdict_detail: z.string().nullable().default(null),
    })
    .default({ extract: null, scoring: {}, summary: null, red_team: null, verdict_detail: null }),
  audit_events: z
    .array(
      z.object({
        level: z.enum(["info", "warn", "error"]).default("info"),
        type: z.string(),
        block: z.string().optional(),
        details: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
      }),
    )
    .default([]),
  audit_llm_calls: z
    .array(
      z.object({
        step: z.string(),
        provider: z.string(),
        requestedModel: z.string(),
        model: z.string(),
        tokensIn: z.number().optional(),
        tokensOut: z.number().optional(),
        rateLimit: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
        systemFingerprint: z.string().nullable().optional(),
      }),
    )
    .default([]),
  invalid_source_refs: z.array(z.string()).default([]),

  // v2: business model + applicability
  business_model_profile: z
    .object({
      type: z.string(),
      confidence: ConfidenceSchema,
      evidence: z
        .array(
          z.object({
            field: z.string(),
            value: z.string(),
            source: z.enum(["sector", "industry", "business_summary", "filing", "llm", "manual"]),
          }),
        )
        .default([]),
      recurringRevenueLike: z.boolean().nullable().default(null),
      assetIntensity: z.enum(["low", "medium", "high"]).nullable().default(null),
      regulated: z.boolean().nullable().default(null),
      primaryFramework: z.string(),
    })
    .nullable()
    .default(null),
  metric_applicability: z.record(z.string(), z.unknown()).default({}),

  // v2: hygiene + clustering
  red_flags_clustered: z
    .array(
      z.object({
        key: z.string(),
        severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        representative: z.string(),
        mergedFrom: z.array(z.string()).default([]),
        canonicalBlock: z.string().optional(),
      }),
    )
    .default([]),

  // v2: data quality
  data_quality: z
    .object({
      coverage: z
        .object({
          keyMetricCoverage: z.number().min(0).max(1).default(0),
          criticalMetricCoverage: z.number().min(0).max(1).default(0),
          indicatorScoreCoverage: z.number().min(0).max(1).default(0),
          sourceSupportCoverage: z.number().min(0).max(1).default(0),
          providerCrossCheckCoverage: z.number().min(0).max(1).default(0),
          applicabilityAdjustedCoverage: z.number().min(0).max(1).default(0),
          missingCriticalMetrics: z.array(z.string()).default([]),
          notApplicableMetrics: z.array(z.string()).default([]),
          unsupportedClaims: z.array(z.string()).default([]),
          conflictingMetrics: z.array(z.string()).default([]),
        })
        .default({
          keyMetricCoverage: 0,
          criticalMetricCoverage: 0,
          indicatorScoreCoverage: 0,
          sourceSupportCoverage: 0,
          providerCrossCheckCoverage: 0,
          applicabilityAdjustedCoverage: 0,
          missingCriticalMetrics: [],
          notApplicableMetrics: [],
          unsupportedClaims: [],
          conflictingMetrics: [],
        }),
      confidence_cap_reason: z.string().default(""),
      provider_coverage_matrix: z.array(z.record(z.string(), z.unknown())).default([]),
      issues: z.array(z.string()).default([]),
    })
    .default({
      coverage: {
        keyMetricCoverage: 0,
        criticalMetricCoverage: 0,
        indicatorScoreCoverage: 0,
        sourceSupportCoverage: 0,
        providerCrossCheckCoverage: 0,
        applicabilityAdjustedCoverage: 0,
        missingCriticalMetrics: [],
        notApplicableMetrics: [],
        unsupportedClaims: [],
        conflictingMetrics: [],
      },
      confidence_cap_reason: "",
      provider_coverage_matrix: [],
      issues: [],
    }),

  debt_breakdown: z.record(z.string(), z.unknown()).nullable().default(null),
  guidance_snapshot: z
    .object({
      revenue_growth_next_q_low: numOrNull,
      revenue_growth_next_q_high: numOrNull,
      revenue_growth_fy_low: numOrNull,
      revenue_growth_fy_high: numOrNull,
      sourceIdx: z.number().int().nullable().default(null),
      confidence: ConfidenceSchema.default("low"),
    })
    .nullable()
    .default(null),
  source_counts: z
    .object({
      external: z.number().int().nonnegative().default(0),
      internal_derived: z.number().int().nonnegative().default(0),
      sec_filings: z.number().int().nonnegative().default(0),
      market_data: z.number().int().nonnegative().default(0),
      news: z.number().int().nonnegative().default(0),
    })
    .default({ external: 0, internal_derived: 0, sec_filings: 0, market_data: 0, news: 0 }),

  // v2: precomputed structures for future cockpit/chart UI
  trader_cockpit: z
    .object({
      actionability: z.enum(["research_only", "watchlist", "trade_ready", "data_insufficient"]).default("research_only"),
      primary_blocker: z.string().nullable().default(null),
      blocker_type: z.enum(["hard", "data_quality", "valuation", "technical_missing"]).nullable().default(null),
      data_quality_label: z.enum(["strong", "medium", "weak"]).default("weak"),
      critical_missing_data: z.array(z.string()).default([]),
      top_bull_points: z.array(z.string()).default([]),
      top_bear_points: z.array(z.string()).default([]),
      next_recheck_trigger: z.string().nullable().default(null),
    })
    .default({
      actionability: "research_only",
      primary_blocker: null,
      blocker_type: null,
      data_quality_label: "weak",
      critical_missing_data: [],
      top_bull_points: [],
      top_bear_points: [],
      next_recheck_trigger: null,
    }),
  score_heatmap: z.array(z.record(z.string(), z.unknown())).default([]),
  source_confidence_matrix: z.array(z.record(z.string(), z.unknown())).default([]),
  chart_data: z
    .object({
      financials_quarterly: z.array(z.record(z.string(), z.unknown())).default([]),
      dilution: z.array(z.record(z.string(), z.unknown())).default([]),
      valuation: z.array(z.record(z.string(), z.unknown())).default([]),
    })
    .default({ financials_quarterly: [], dilution: [], valuation: [] }),

  // Phase A: Forensik / Business Model (optional, default null/empty)
  business_model_type: z.string().default(""),
  piotroski_components: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.null()])).default({}),
  mohanram_components: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.null()])).default({}),
  altman_classification: z.enum(["safe", "grey", "distress"]).nullable().default(null),
  beneish_manipulation_probability: z.enum(["low", "high"]).nullable().default(null),

  // Phase C: Red-Team
  red_team: z.object({
    bear_arguments: z.array(z.object({
      argument: z.string(),
      rebuttal_of: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      probability: z.number().min(0).max(1),
      sourceIdx: z.number().int().nullable().default(null),
    })).default([]),
    overlooked_risks: z.array(z.string()).default([]),
    stress_test: z.object({
      revenue_growth_halved: z.string().default(""),
      margin_compression_5ppt: z.string().default(""),
      multiple_contraction_30pct: z.string().default(""),
    }).default({}),
    final_verdict: z.string().default(""),
    confidence: ConfidenceSchema.default("medium"),
  }).nullable().default(null),

  // Phase E: Reverse-DCF
  reverse_dcf: z.object({
    implied_growth_rate: z.number().nullable().default(null),
    classification: z.enum(["conservative", "reasonable", "ambitious", "speculative", "extreme", "unknown"]).default("unknown"),
  }).nullable().default(null),

  valuation_regime: z.enum(["pre_profit", "cyclical", "mature"]).nullable().default(null),
  fair_value_corridor: z
    .object({
      min: numOrNull,
      median: numOrNull,
      max: numOrNull,
    })
    .nullable()
    .default(null),
  current_vs_fair_value_pct: numOrNull,
  expectations_gap: z.enum(["market_underexpecting", "fair", "market_overexpecting"]).nullable().default(null),
  inflection_flags: z
    .object({
      grossMarginTurnedPositive: z.boolean().default(false),
      operatingMarginTurnedPositive: z.boolean().default(false),
      fcfTurnedPositive: z.boolean().default(false),
      lossNarrowingTowardBreakeven: z.boolean().default(false),
      revenueAccelerationPositive: z.boolean().default(false),
      revisionMomentumPositive: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  ownership_score: numOrNull,
  aaqs_binary: z
    .object({
      score: z.number().int().nonnegative(),
      total: z.number().int().positive(),
      passed: z.boolean(),
    })
    .nullable()
    .default(null),
  stability_scores: z
    .object({
      grossMargin: numOrNull,
      operatingMargin: numOrNull,
      fcfMargin: numOrNull,
    })
    .nullable()
    .default(null),
  lens_results: z.array(z.record(z.string(), z.unknown())).default([]),

  technicals: z
    .object({
      sma50: numOrNull,
      sma200: numOrNull,
      ema50: numOrNull,
      ema200: numOrNull,
      priceVsMa200Pct: numOrNull,
      ma200SlopePct: numOrNull,
      position52wPct: numOrNull,
      distanceTo52wHighPct: numOrNull,
      rsi14: numOrNull,
      macd: z
        .object({
          line: numOrNull,
          signal: numOrNull,
          histogram: numOrNull,
          histogramPositive: z.boolean().default(false),
        })
        .default({ line: null, signal: null, histogram: null, histogramPositive: false }),
      relativeStrength: z
        .object({
          vsIndex1m: numOrNull,
          vsIndex3m: numOrNull,
          vsIndex6m: numOrNull,
          vsIndex12m: numOrNull,
          vsSector1m: numOrNull,
          vsSector3m: numOrNull,
          vsSector6m: numOrNull,
          vsSector12m: numOrNull,
        })
        .default({
          vsIndex1m: null,
          vsIndex3m: null,
          vsIndex6m: null,
          vsIndex12m: null,
          vsSector1m: null,
          vsSector3m: null,
          vsSector6m: null,
          vsSector12m: null,
        }),
      atr: numOrNull,
      realizedVolatility: numOrNull,
      obvTrend: numOrNull,
      beta: numOrNull,
    })
    .nullable()
    .default(null),
  regime: RegimeSchema.nullable().default(null),
  breadth_is_proxy: z.boolean().default(false),
  timing_score: numOrNull,
  quadrant: z
    .object({
      label: z.enum(["kaufen", "warten", "spekulativ", "meiden"]),
      xTimingScore: z.number().min(0).max(100),
      yFundamentalScore: numOrNull,
    })
    .nullable()
    .default(null),
  action_recommendation: z.string().nullable().default(null),

  analyst: z
    .object({
      isInterpretation: z.literal(true),
      thesis: z.string().default(""),
      numbersSay: z.string().default(""),
      bullCase: z.string().default(""),
      bearCase: z.string().default(""),
      catalystNote: z.string().default(""),
      entryTrigger: z.string().default(""),
      exitWatchTrigger: z.string().default(""),
      catalysts: z
        .array(
          z.object({
            text: z.string(),
            anchorMetric: z.string().nullable().default(null),
            status: z.enum(["confirmed", "speculative"]),
            sourceUrl: z.string().nullable().default(null),
            sourceDate: z.string().nullable().default(null),
          }),
        )
        .default([]),
      chartReading: z.string().default(""),
      groundingFacts: z.array(z.string()).default([]),
      model: z.object({
        name: z.string(),
        version: z.string().nullable().default(null),
        ranAt: z.string(),
      }),
    })
    .nullable()
    .default(null),

  trade_setup: z
    .object({
      entry_zone_max: numOrNull,
      margin_of_safety: numOrNull,
      stop_ref: numOrNull,
      risk_reward: numOrNull,
      action: z.enum(["kaufen", "warten", "nicht_beurteilbar"]).default("nicht_beurteilbar"),
      sizing_hint: z.enum(["kleiner", "normal", "nicht_beurteilbar"]).default("nicht_beurteilbar"),
      distance_to_entry_zone_pct: numOrNull,
      computable: z.boolean().default(false),
    })
    .default({
      entry_zone_max: null,
      margin_of_safety: null,
      stop_ref: null,
      risk_reward: null,
      action: "nicht_beurteilbar",
      sizing_hint: "nicht_beurteilbar",
      distance_to_entry_zone_pct: null,
      computable: false,
    }),

  // Phase F: Fair Value
  fair_value: z.object({
    currency: z.string().default("USD"),
    current_price: z.number().nullable().default(null),
    point_estimate: z.number().nullable().default(null),
    range_low: z.number().nullable().default(null),
    range_high: z.number().nullable().default(null),
    upside_pct: z.number().nullable().default(null),
    classification: z.enum(["deep_value", "value", "fair", "premium", "overvalued"]).nullable().default(null),
    methods: z.array(z.object({
      name: z.enum(["ev_sales", "ev_gross_profit", "forward_pe"]),
      applicable: z.boolean(),
      value: z.number().nullable(),
      weight: z.number().min(0).max(1),
      confidence: ConfidenceSchema,
      rationale: z.string().max(120).default(""),
      inputs: z.record(z.string(), z.number().nullable()).default({}),
    })).default([]),
    reverse_dcf: z.object({
      implied_fcf_cagr: z.number().nullable().default(null),
      terminal_growth: z.number().default(0.03),
      horizon_years: z.number().int().positive().default(10),
      classification: z.enum(["conservative", "reasonable", "ambitious", "speculative", "extreme"]).nullable().default(null),
    }).nullable().default(null),
    confidence: ConfidenceSchema,
    applicable_method_count: z.number().int().min(0).default(0),
    rationale_short: z.string().max(120).default(""),
    asof: z.string().default(""),
  }).nullable().default(null),

  // Phase F: Verdict
  verdict: z.object({
    label: z.string().max(80),
    reason_code: z.string(),
    weakest_block: BlockKeySchema.nullable().default(null),
    detail: z.string().max(200).default(""),
  }).nullable().default(null),
});

export type Report = z.infer<typeof ReportSchema>;

/** Sub-Schema, das vom LLM-Section-Answerer geliefert wird (research.md §3.2 in AGENT.md). */
export const SectionAnswerSchema = z.object({
  block: z.enum([
    "growth_market",
    "unit_economics_margins",
    "quality_moat",
    "valuation",
    "capital_discipline_dilution",
    "catalysts_revisions_sentiment",
    "ownership_smart_money",
    "risk_fragility",
  ]),
  indicators: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(10).nullable(),
      rationale: z.string().default(""),
      sourceIdx: z.number().int().nonnegative().nullable().default(null),
    }),
  ),
  confidence: ConfidenceSchema.default("medium"),
  hard_blockers: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  moat_rating: MoatRatingSchema.nullable().optional(),
  moat_evidence: z.array(z.string()).default([]),
  moat_threats: z.array(z.string()).default([]),
});
export type SectionAnswer = z.infer<typeof SectionAnswerSchema>;

// Phase C: Red-Team output schema (used for LLM response validation)
export const RedTeamSchema = z.object({
  bear_arguments: z.array(z.object({
    argument: z.string(),
    rebuttal_of: z.string().default(""),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    probability: z.number().min(0).max(1).default(0.5),
    sourceIdx: z.number().int().nullable().default(null),
  })).default([]),
  overlooked_risks: z.array(z.string()).default([]),
  stress_test: z.object({
    revenue_growth_halved: z.string().default(""),
    margin_compression_5ppt: z.string().default(""),
    multiple_contraction_30pct: z.string().default(""),
  }).default({}),
  final_verdict: z.string().default(""),
  confidence: ConfidenceSchema.default("medium"),
});
export type RedTeam = z.infer<typeof RedTeamSchema>;
