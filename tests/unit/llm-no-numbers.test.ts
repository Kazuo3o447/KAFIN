import { describe, expect, it } from "vitest";
import { applyAnalystGuardrails } from "@/lib/analyst/guardrails";
import { ReportSchema } from "@/lib/schemas/report";

describe("llm no numbers", () => {
  it("removes non-grounded numeric claims from analyst text and keeps report numbers unchanged", () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 72,
      gate: "Yellow",
      confidence: "medium",
      key_metrics: { revenue_growth_yoy: 0.18, fcf_margin: 0.06 },
      score_breakdown: {
        growth_market: 12,
        unit_economics_margins: 10,
        quality_moat: 11,
        valuation: 9,
        capital_discipline_dilution: 9,
        catalysts_revisions_sentiment: 10,
        risk_fragility: 9,
      },
      moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
    });

    const before = JSON.stringify(report);
    const out = applyAnalystGuardrails(report, {
      thesis: "Growth is 18%. Fair value should be 200.",
      bullCase: "FCF margin is 6%.",
      bearCase: "Revenue could drop 40%.",
      chartReading: "Momentum 999 is strong.",
      catalysts: [{ text: "Product launch", anchorMetric: "revenue_growth_yoy" }],
    });

    expect(out.thesis).not.toContain("200");
    expect(out.chartReading).not.toContain("999");
    expect(out.bullCase).toContain("6%");
    expect(JSON.stringify(report)).toBe(before);
  });
});
