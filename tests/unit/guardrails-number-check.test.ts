import { describe, expect, it } from "vitest";
import { applyAnalystGuardrails } from "@/lib/analyst/guardrails";
import { ReportSchema, type Report } from "@/lib/schemas/report";

function makeReport(): Report {
  return ReportSchema.parse({
    ticker: "TEST",
    research_date: "2026-06-01",
    category: "Quality Growth",
    growth_research_score: 78,
    gate: "Green",
    confidence: "high",
    key_metrics: { revenue_growth_yoy: 0.2 },
    score_breakdown: {
      growth_market: 12,
      unit_economics_margins: 10,
      quality_moat: 14,
      valuation: 10,
      capital_discipline_dilution: 10,
      catalysts_revisions_sentiment: 10,
      risk_fragility: 8,
    },
    moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
    timing_score: 62,
    regime: "neutral",
    quadrant: { label: "kaufen", xTimingScore: 62, yFundamentalScore: 78 },
  });
}

describe("analyst guardrails number check", () => {
  it("removes fabricated numbers and keeps covered numbers", () => {
    const report = makeReport();
    const out = applyAnalystGuardrails(report, {
      thesis: "The score is 78 and revenue growth is 20%.",
      bullCase: "Upside is 999% soon.",
      bearCase: "Timing can drop.",
      chartReading: "Timing score at 62 supports momentum.",
      catalysts: [],
    });

    expect(out.thesis).toContain("78");
    expect(out.thesis).toContain("20%");
    expect(out.bullCase).not.toContain("999%");
    expect(out.removedNumbers).toContain("999%");
  });
});
