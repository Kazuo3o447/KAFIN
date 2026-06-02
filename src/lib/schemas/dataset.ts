import { z } from "zod";
import { SourceClassSchema, type Provenance } from "@/lib/providers/types";

export const ValueKindSchema = z.enum(["actual", "estimate", "derived", "assumption"]);
export type ValueKind = z.infer<typeof ValueKindSchema>;

export const ProvenanceSchema = z.object({
  source: z.string(),
  url: z.string().min(1),
  klass: SourceClassSchema,
  asOf: z.string().nullable().default(null),
  stale: z.boolean().default(false),
});

const TrackedBaseSchema = z.object({
  provenance: ProvenanceSchema,
  kind: ValueKindSchema.default("actual"),
});

export const TrackedNumberSchema = TrackedBaseSchema.extend({
  value: z.number().nullable().default(null),
}).superRefine((tracked, ctx) => {
  if (tracked.value !== null && !tracked.provenance.asOf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tracked non-null number requires provenance.asOf",
      path: ["provenance", "asOf"],
    });
  }
});

export const TrackedStringSchema = TrackedBaseSchema.extend({
  value: z.string().nullable().default(null),
}).superRefine((tracked, ctx) => {
  if (tracked.value !== null && !tracked.provenance.asOf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tracked non-null string requires provenance.asOf",
      path: ["provenance", "asOf"],
    });
  }
});

export const TrackedBooleanSchema = TrackedBaseSchema.extend({
  value: z.boolean().nullable().default(null),
}).superRefine((tracked, ctx) => {
  if (tracked.value !== null && !tracked.provenance.asOf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tracked non-null boolean requires provenance.asOf",
      path: ["provenance", "asOf"],
    });
  }
});

export function tracked<T>(
  value: T | null,
  provenance: Provenance,
  kind: ValueKind = "actual",
): { value: T | null; provenance: Provenance; kind: ValueKind } {
  return { value, provenance, kind };
}

const NumberOrNull = z.number().nullable().default(null);
const StringOrNull = z.string().nullable().default(null);

const FinancialPeriodCoreSchema = z.object({
  periodEnd: z.string(),
  fiscalYear: z.number().nullable().default(null),
  fiscalQuarter: z.number().nullable().default(null),
  revenue: TrackedNumberSchema,
  grossProfit: TrackedNumberSchema,
  ebit: TrackedNumberSchema,
  ebitda: TrackedNumberSchema,
  netIncome: TrackedNumberSchema,
  operatingCashflow: TrackedNumberSchema,
  capex: TrackedNumberSchema,
  freeCashflow: TrackedNumberSchema,
  sharesDiluted: TrackedNumberSchema,
  dividendPerShare: TrackedNumberSchema,
  totalDebt: TrackedNumberSchema,
  cashAndEquivalents: TrackedNumberSchema,
  totalEquity: TrackedNumberSchema,
  totalAssets: TrackedNumberSchema,
  interestExpense: TrackedNumberSchema,
  researchAndDevelopment: TrackedNumberSchema,
  stockBasedComp: TrackedNumberSchema,
  inventory: TrackedNumberSchema,
  accountsReceivable: TrackedNumberSchema,
  shareRepurchases: TrackedNumberSchema,
});

export const FinancialPeriodSchema = FinancialPeriodCoreSchema;

export const EstimatesSeriesItemSchema = z.object({
  year: z.number(),
  value: NumberOrNull,
});

export const EstimatesSchema = z.object({
  revenueFwd: z.array(EstimatesSeriesItemSchema).default([]),
  ebitFwd: z.array(EstimatesSeriesItemSchema).default([]),
  epsFwd: z.array(EstimatesSeriesItemSchema).default([]),
  revenueCagr3yFwd: NumberOrNull,
  ebitCagr3yFwd: NumberOrNull,
  guidanceTrend: z.enum(["raised", "maintained", "lowered"]).nullable().default(null),
  provenance: z.array(ProvenanceSchema).default([]),
});

export const EarningsEventSchema = z.object({
  date: z.string(),
  epsActual: NumberOrNull,
  epsEstimate: NumberOrNull,
  surprisePct: NumberOrNull,
  revenueActual: NumberOrNull,
  revenueEstimate: NumberOrNull,
  revenueSurprisePct: NumberOrNull,
});

export const PricePointSchema = z.object({
  date: z.string(),
  close: z.number(),
  volume: z.number().nullable().default(null),
});

export const PriceHistorySchema = z.object({
  currency: StringOrNull,
  daily: z.array(PricePointSchema).default([]),
  provenance: z.array(ProvenanceSchema).default([]),
});

export const OwnershipSchema = z.object({
  institutionalPctHeld: NumberOrNull,
  institutionalQoqChangePp: NumberOrNull,
  institutionalTrend: z.enum(["accumulating", "distributing", "flat"]).nullable().default(null),
  insiderOwnershipPct: NumberOrNull,
  sharesOutstanding: NumberOrNull,
  floatShares: NumberOrNull,
  provenance: z.array(ProvenanceSchema).default([]),
});

export const InsiderTxnSchema = z.object({
  date: z.string(),
  insiderName: z.string(),
  role: z.enum(["CEO", "CFO", "director", "officer", "other"]),
  type: z.enum(["buy", "sell"]),
  valueUsd: NumberOrNull,
  shares: NumberOrNull,
  isOpenMarket: z.boolean().default(false),
  provenance: z.array(ProvenanceSchema).default([]),
});

export const ShortInterestSchema = z.object({
  pctOfFloat: NumberOrNull,
  daysToCover: NumberOrNull,
  sharesShort: NumberOrNull,
  trend: z.enum(["rising", "falling", "flat"]).nullable().default(null),
  provenance: z.array(ProvenanceSchema).default([]),
  asOf: z.string().nullable().default(null),
});

export const NewsSentimentSchema = z.object({
  score: NumberOrNull,                 // -1 to +1, bullish positive
  bullishPct: NumberOrNull,            // 0–1
  bearishPct: NumberOrNull,            // 0–1
  articlesInLastWeek: NumberOrNull,
  buzz: NumberOrNull,                  // relative buzz score from Finnhub
  provenance: z.array(ProvenanceSchema).default([]),
  asOf: z.string().nullable().default(null),
});

export const SegmentRevenueSchema = z.object({
  periodEnd: z.string(),
  value: NumberOrNull,
});

export const SegmentSchema = z.object({
  name: z.string(),
  revenueByPeriod: z.array(SegmentRevenueSchema).default([]),
  provenance: z.array(ProvenanceSchema).default([]),
});

export const SaaSMetricsSchema = z.object({
  netRevenueRetention: NumberOrNull,
  remainingPerformanceObligations: NumberOrNull,
  deferredRevenue: NumberOrNull,
  arr: NumberOrNull,
  provenance: z.array(ProvenanceSchema).default([]),
});

export const AnalystSchema = z.object({
  count: NumberOrNull,
  recommendationMean: NumberOrNull,
  targetMean: NumberOrNull,
  targetHigh: NumberOrNull,
  targetLow: NumberOrNull,
  upgrades3m: NumberOrNull,
  downgrades3m: NumberOrNull,
  provenance: z.array(ProvenanceSchema).default([]),
});

export const CoverageDimensionSchema = z.object({
  filled: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  ratio: z.number().min(0).max(1),
  anyStale: z.boolean().default(false),
});

export const CoverageReportSchema = z.object({
  growth: CoverageDimensionSchema,
  profitability: CoverageDimensionSchema,
  risk: CoverageDimensionSchema,
  valuation: CoverageDimensionSchema,
  momentum_sentiment: CoverageDimensionSchema,
  ownership_smart_money: CoverageDimensionSchema,
  overallRatio: z.number().min(0).max(1),
});

export const CompanyDatasetSchema = z.object({
  identity: z.object({
    ticker: z.string(),
    name: StringOrNull,
    isin: StringOrNull,
    wkn: StringOrNull,
    exchange: StringOrNull,
    currency: StringOrNull,
    country: StringOrNull,
    sector: StringOrNull,
    industry: StringOrNull,
    asOf: z.string(),
  }),
  annual: z.array(FinancialPeriodSchema).default([]),
  quarterly: z.array(FinancialPeriodSchema).default([]),
  estimates: EstimatesSchema,
  earningsHistory: z.array(EarningsEventSchema).default([]),
  prices: PriceHistorySchema,
  ownership: OwnershipSchema,
  insiderTransactions: z.array(InsiderTxnSchema).default([]),
  shortInterest: ShortInterestSchema,
  segments: z.array(SegmentSchema).default([]),
  saas: SaaSMetricsSchema.nullable().default(null),
  analyst: AnalystSchema,
  newsSentiment: NewsSentimentSchema.default({}),
  coverage: CoverageReportSchema,
});

export const MarketContextSchema = z.object({
  asOf: z.string(),
  indexVsMa200Pct: NumberOrNull,
  breadthPctAboveMa200: NumberOrNull,
  vix: NumberOrNull,
  vixPercentile1y: NumberOrNull,
  highYieldSpread: NumberOrNull,
  yieldCurve10y2y: NumberOrNull,
  regime: z.enum(["risk_on", "neutral", "risk_off"]).nullable().default(null),
  provenance: z.array(ProvenanceSchema).default([]),
});

export type FinancialPeriod = z.infer<typeof FinancialPeriodSchema>;
export type Estimates = z.infer<typeof EstimatesSchema>;
export type EarningsEvent = z.infer<typeof EarningsEventSchema>;
export type PricePoint = z.infer<typeof PricePointSchema>;
export type PriceHistory = z.infer<typeof PriceHistorySchema>;
export type Ownership = z.infer<typeof OwnershipSchema>;
export type InsiderTxn = z.infer<typeof InsiderTxnSchema>;
export type ShortInterest = z.infer<typeof ShortInterestSchema>;
export type NewsSentiment = z.infer<typeof NewsSentimentSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type SaaSMetrics = z.infer<typeof SaaSMetricsSchema>;
export type Analyst = z.infer<typeof AnalystSchema>;
export type CoverageReport = z.infer<typeof CoverageReportSchema>;
export type CompanyDataset = z.infer<typeof CompanyDatasetSchema>;
export type MarketContext = z.infer<typeof MarketContextSchema>;
