import { describe, it, expect } from "vitest";
import { diffReports } from "@/lib/diff/report-diff";
import type { Report } from "@/lib/schemas/report";

function mkReport(overrides: Partial<Report> = {}): Report {
  const base: Report = {
    ticker: "ABC",
    company_name: "ABC Inc.",
    exchange: "NASDAQ",
    sector: "Tech",
    industry: "SaaS",
    research_date: "2026-05-01",
    category: "Quality Growth",
    growth_research_score: 70,
    gate: "Yellow",
    confidence: "medium",
    thesis_summary: "Solides Wachstum.",
    bull_case: ["b1", "b2"],
    bear_case: ["bear1"],
    key_metrics: {
      revenue_growth_yoy: 0.3,
      revenue_cagr_3y: 0.25,
      gross_margin: 0.7,
      operating_margin: 0.1,
      fcf_margin: 0.05,
      roic: 0.12,
      rule_of_40: 35,
      rule_of_x: null,
      share_count_growth_yoy: 0.02,
      sbc_to_revenue: 0.08,
      net_debt_to_ebitda: 1.2,
      beta: 1.1,
      ntm_pe: 30,
      ev_sales: 5,
      ev_gross_profit: 7,
      peg: 1.5,
    },
    score_breakdown: {
      growth_market: 12,
      unit_economics_margins: 10,
      quality_moat: 13,
      valuation: 9,
      capital_discipline_dilution: 8,
      catalysts_revisions_sentiment: 7,
      risk_fragility: 8,
    },
    block_audits: [
      {
        block: "growth_market",
        indicators: [
          { name: "Revenue Growth", score: 7, rationale: "stark", sourceIdx: [1] },
          { name: "TAM", score: 6, rationale: "groß", sourceIdx: [2] },
        ],
        confidence: "medium",
        hard_blockers: [],
      },
    ],
    moat_assessment: { rating: "Narrow", sources: [], evidence: [], threats: [] },
    catalysts: ["Earnings Q3"],
    red_flags: [],
    hard_blockers: [],
    open_questions: ["Wie skaliert RoW?"],
    falsification_tests: [],
    source_list: [],
    handoff_to_trade_engine: false,
  };
  return { ...base, ...overrides };
}

describe("diffReports", () => {
  it("berechnet Score-Δ und erkennt Gate/Category-Wechsel", () => {
    const a = mkReport({ growth_research_score: 70, gate: "Yellow", category: "Quality Growth" });
    const b = mkReport({
      growth_research_score: 82,
      gate: "Green",
      category: "Rocket",
      research_date: "2026-06-01",
    });
    const d = diffReports({ id: "a1", report: a }, { id: "b1", report: b });
    expect(d.meta.scoreDelta).toBe(12);
    expect(d.meta.gateChanged).toBe(true);
    expect(d.meta.categoryChanged).toBe(true);
  });

  it("erkennt Block-Δ je Block korrekt", () => {
    const a = mkReport();
    const b = mkReport({
      score_breakdown: { ...a.score_breakdown, growth_market: 15, valuation: 6 },
    });
    const d = diffReports({ id: "a", report: a }, { id: "b", report: b });
    const gm = d.blocks.find((x) => x.block === "growth_market")!;
    const val = d.blocks.find((x) => x.block === "valuation")!;
    expect(gm.delta).toBe(3);
    expect(val.delta).toBe(-3);
  });

  it("liefert added/removed/unchanged für Listen", () => {
    const a = mkReport({ bull_case: ["x", "y"] });
    const b = mkReport({ bull_case: ["y", "z"] });
    const d = diffReports({ id: "a", report: a }, { id: "b", report: b });
    expect(d.bullCase.added).toEqual(["z"]);
    expect(d.bullCase.removed).toEqual(["x"]);
    expect(d.bullCase.unchanged).toEqual(["y"]);
  });

  it("listet Indikator-Score-Änderungen sortiert nach |Δ|", () => {
    const a = mkReport();
    const b = mkReport({
      block_audits: [
        {
          block: "growth_market",
          indicators: [
            { name: "Revenue Growth", score: 9, rationale: "stark", sourceIdx: [1] },
            { name: "TAM", score: 5, rationale: "weiterhin groß", sourceIdx: [2] },
          ],
          confidence: "high",
          hard_blockers: [],
        },
      ],
    });
    const d = diffReports({ id: "a", report: a }, { id: "b", report: b });
    expect(d.indicators[0]?.name).toBe("Revenue Growth");
    expect(d.indicators[0]?.delta).toBe(2);
    expect(d.indicators[1]?.name).toBe("TAM");
    expect(d.indicators[1]?.delta).toBe(-1);
    expect(d.indicators[1]?.rationaleChanged).toBe(true);
  });

  it("rechnet pctDelta für Key-Metrics", () => {
    const a = mkReport();
    const b = mkReport({
      key_metrics: { ...a.key_metrics, revenue_growth_yoy: 0.45 },
    });
    const d = diffReports({ id: "a", report: a }, { id: "b", report: b });
    const m = d.keyMetrics.find((x) => x.key === "revenue_growth_yoy")!;
    expect(m.before).toBe(0.3);
    expect(m.after).toBe(0.45);
    expect(m.delta).toBeCloseTo(0.15, 5);
    expect(m.pctDelta).toBeCloseTo(0.5, 5);
  });
});
