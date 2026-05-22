import { describe, it, expect } from "vitest";
import { ReportSchema } from "@/lib/schemas/report";

/** Minimal valid report without fair_value or verdict fields */
const MINIMAL_REPORT = {
  ticker: "TEST",
  company_name: "Test Co",
  exchange: "NYSE",
  isin: "US000000001",
  sector: "Technology",
  industry: "Software",
  research_date: "2024-01-01",
  business_model_type: "SaaS",
  category: "Quality Growth",
  gate: "Green",
  confidence: "medium",
  growth_research_score: 70,
  handoff_to_trade_engine: false,
  thesis_summary: "A test thesis.",
  bull_case: [],
  bear_case: [],
  hard_blockers: [],
  red_flags: [],
  catalysts: [],
  open_questions: [],
  falsification_tests: [],
  source_list: [],
  key_metrics: {
    revenue_growth_yoy: null,
    revenue_cagr_3y: null,
    gross_margin: null,
    operating_margin: null,
    fcf_margin: null,
    roic: null,
    peg: null,
    rule_of_40: null,
    rule_of_x: null,
    share_count_growth_yoy: null,
    sbc_to_revenue: null,
    net_debt_to_ebitda: null,
    ev_sales: null,
    ev_gross_profit: null,
    ntm_pe: null,
    beta: null,
    piotroski_f: null,
    mohanram_g: null,
    altman_z: null,
    beneish_m: null,
    cash_runway_months: null,
    wacc: null,
    roic_wacc_spread: null,
    gross_margin_trend: null,
    operating_margin_trend: null,
    fcf_margin_trend: null,
    gross_margin_stddev: null,
    operating_margin_stddev: null,
    fcf_margin_stddev: null,
    analyst_upgrades_3m: null,
    analyst_downgrades_3m: null,
    insider_net_activity_usd: null,
    earnings_surprise_pct: null,
    net_revenue_retention: null,
    arr_growth_yoy: null,
  },
  score_breakdown: {
    growth_market: 10,
    unit_economics_margins: 10,
    quality_moat: 10,
    valuation: 10,
    capital_discipline_dilution: 10,
    catalysts_revisions_sentiment: 10,
    risk_fragility: 10,
  },
  block_audits: [],
  moat_assessment: {
    rating: "Unknown",
    evidence: [],
    threats: [],
  },
};

describe("ReportSchema backward compatibility (Phase F)", () => {
  it("parses old report without fair_value → fair_value is null", () => {
    const result = ReportSchema.parse(MINIMAL_REPORT);
    expect(result.fair_value).toBeNull();
  });

  it("parses old report without verdict → verdict is null", () => {
    const result = ReportSchema.parse(MINIMAL_REPORT);
    expect(result.verdict).toBeNull();
  });

  it("parses report with fair_value and verdict when provided", () => {
    const withFV = {
      ...MINIMAL_REPORT,
      fair_value: {
        currency: "USD",
        current_price: 100,
        point_estimate: 90,
        range_low: 80,
        range_high: 100,
        upside_pct: -0.1,
        classification: "fair" as const,
        methods: [],
        reverse_dcf: null,
        confidence: "medium" as const,
        applicable_method_count: 2,
        rationale_short: "Within range",
        asof: "2024-01-01",
      },
      verdict: {
        label: "Leicht unter Fair Value",
        reason_code: "gate_green_fair",
        weakest_block: null,
        detail: "Starkes Wachstum bei solider Marge.",
      },
    };
    const result = ReportSchema.parse(withFV);
    expect(result.fair_value?.classification).toBe("fair");
    expect(result.verdict?.label).toBe("Leicht unter Fair Value");
  });
});
