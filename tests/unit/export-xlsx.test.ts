import { describe, it, expect } from "vitest";
import { renderReportXlsx } from "@/lib/export/xlsx";
import type { Report } from "@/lib/schemas/report";
import ExcelJS from "exceljs";

const MINIMAL_KM = {
  revenue_growth_yoy: null, revenue_cagr_3y: null, gross_margin: null,
  operating_margin: null, fcf_margin: null, roic: null, peg: null,
  rule_of_40: null, rule_of_x: null, share_count_growth_yoy: null,
  sbc_to_revenue: null, net_debt_to_ebitda: null, ev_sales: null,
  ev_gross_profit: null, ntm_pe: null, beta: null, piotroski_f: null,
  mohanram_g: null, altman_z: null, beneish_m: null, cash_runway_months: null,
  wacc: null, roic_wacc_spread: null, gross_margin_trend: null,
  operating_margin_trend: null, fcf_margin_trend: null, gross_margin_stddev: null,
  operating_margin_stddev: null, fcf_margin_stddev: null,
  analyst_upgrades_3m: null, analyst_downgrades_3m: null,
  insider_net_activity_usd: null, earnings_surprise_pct: null,
  net_revenue_retention: null, arr_growth_yoy: null,
};

const BASE_REPORT: Report = {
  ticker: "AAPL",
  company_name: "Apple Inc.",
  exchange: "NASDAQ",
  isin: "US0378331005",
  sector: "Technology",
  industry: "Consumer Electronics",
  research_date: "2024-01-01",
  business_model_type: "Consumer",
  category: "Quality Growth",
  gate: "Green",
  confidence: "high",
  growth_research_score: 72,
  handoff_to_trade_engine: false,
  thesis_summary: "Apple moat thesis.",
  bull_case: ["Strong ecosystem"],
  bear_case: ["Saturation risk"],
  hard_blockers: [],
  red_flags: [],
  catalysts: ["AI expansion"],
  open_questions: [],
  falsification_tests: [],
  source_list: [],
  key_metrics: MINIMAL_KM,
  score_breakdown: {
    growth_market: 12, unit_economics_margins: 10, quality_moat: 13,
    valuation: 10, capital_discipline_dilution: 9, catalysts_revisions_sentiment: 9,
    risk_fragility: 9,
  },
  block_audits: [],
  moat_assessment: { rating: "Wide", evidence: ["High switching costs"], threats: [] },
  fair_value: null,
  verdict: null,
};

describe("renderReportXlsx", () => {
  it("generates a valid workbook with required sheets", async () => {
    const buf = await renderReportXlsx(BASE_REPORT);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toContain("Overview");
    expect(sheetNames).toContain("KeyMetrics");
    expect(sheetNames).toContain("Scoring");
    expect(sheetNames).toContain("Sources");
  });

  it("includes Fair Value sheet when fair_value is present", async () => {
    const report: Report = {
      ...BASE_REPORT,
      fair_value: {
        currency: "USD",
        current_price: 182,
        point_estimate: 160,
        range_low: 140,
        range_high: 175,
        upside_pct: -0.12,
        classification: "premium",
        methods: [
          { name: "ev_sales", value: 155, weight: 0.4, applicable: true, confidence: "medium" as const, rationale: "", inputs: {} },
          { name: "ev_gross_profit", value: 162, weight: 0.35, applicable: true, confidence: "medium" as const, rationale: "", inputs: {} },
          { name: "forward_pe", value: 163, weight: 0.25, applicable: true, confidence: "medium" as const, rationale: "", inputs: {} },
        ],
        reverse_dcf: {
          implied_fcf_cagr: 0.08,
          classification: "fair" as const,
          terminal_growth: 0.03,
          horizon_years: 10,
        },
        confidence: "medium",
        applicable_method_count: 3,
        rationale_short: "Premium to peers.",
        asof: "2024-01-01",
      },
    };

    const buf = await renderReportXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toContain("Fair Value");

    const fvSheet = wb.getWorksheet("Fair Value")!;
    // Column 1 = "Methode / Feld" (key)
    const rowValues = fvSheet.getColumn(1).values.filter(Boolean) as string[];
    // Should have 3 method rows
    expect(rowValues.filter((v) => ["ev_sales", "ev_gross_profit", "forward_pe"].includes(String(v)))).toHaveLength(3);
  });

  it("includes Verdict sheet when verdict is present", async () => {
    const report: Report = {
      ...BASE_REPORT,
      verdict: {
        label: "Leicht überteuert",
        reason_code: "gate_green_premium",
        weakest_block: null,
        detail: "Starkes Geschäftsmodell, aber Bewertung ambitioniert.",
      },
    };

    const buf = await renderReportXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toContain("Verdict");

    const vdSheet = wb.getWorksheet("Verdict")!;
    // Column 2 = "Wert" values
    const labels = vdSheet.getColumn(2).values.filter(Boolean);
    expect(labels).toContain("Leicht überteuert");
  });

  it("no Fair Value sheet when fair_value is null", async () => {
    const buf = await renderReportXlsx(BASE_REPORT);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).not.toContain("Fair Value");
    expect(sheetNames).not.toContain("Verdict");
  });
});
