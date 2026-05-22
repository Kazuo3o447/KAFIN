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
