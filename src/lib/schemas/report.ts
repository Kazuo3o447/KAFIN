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
export const MoatRatingSchema = z.enum([
  "Wide",
  "Narrow",
  "Emerging",
  "No Moat",
  "Negative Trend",
  "Unknown",
]);

const numOrNull = z.number().nullable();

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
});
export type KeyMetrics = z.infer<typeof KeyMetricsSchema>;

export const ScoreBreakdownSchema = z.object({
  growth_market: z.number().min(0).max(18),
  unit_economics_margins: z.number().min(0).max(14),
  quality_moat: z.number().min(0).max(18),
  valuation: z.number().min(0).max(14),
  capital_discipline_dilution: z.number().min(0).max(12),
  catalysts_revisions_sentiment: z.number().min(0).max(12),
  risk_fragility: z.number().min(0).max(12),
});

export const BlockKeySchema = z.enum([
  "growth_market",
  "unit_economics_margins",
  "quality_moat",
  "valuation",
  "capital_discipline_dilution",
  "catalysts_revisions_sentiment",
  "risk_fragility",
]);

export const BlockIndicatorSchema = z.object({
  name: z.string(),
  score: z.number().nullable(),
  rationale: z.string().default(""),
  sourceIdx: z.array(z.number().int().nonnegative()).default([]),
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

export const ReportSchema = z.object({
  ticker: z.string().min(1),
  company_name: z.string().default(""),
  isin: z.string().default(""),
  exchange: z.string().default(""),
  sector: z.string().default(""),
  industry: z.string().default(""),
  research_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: CategorySchema,
  growth_research_score: z.number().min(0).max(100),
  gate: GateSchema,
  confidence: ConfidenceSchema,
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
    classification: z.enum(["cheap", "fair", "ambitious", "speculative", "unknown"]).default("unknown"),
  }).nullable().default(null),

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
      classification: z.enum(["conservative", "fair", "ambitious", "extreme"]).nullable().default(null),
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
