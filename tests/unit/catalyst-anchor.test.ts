import { describe, expect, it } from "vitest";
import { applyAnalystGuardrails } from "@/lib/analyst/guardrails";
import { ReportSchema } from "@/lib/schemas/report";

describe("catalyst anchor", () => {
  it("marks catalysts as confirmed/speculative based on quantitative anchor", () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 72,
      gate: "Green",
      confidence: "high",
      key_metrics: { revenue_growth_yoy: 0.2 },
      score_breakdown: {
        growth_market: 10,
        unit_economics_margins: 10,
        quality_moat: 10,
        valuation: 10,
        capital_discipline_dilution: 10,
        catalysts_revisions_sentiment: 10,
        risk_fragility: 10,
      },
      moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
      timing_score: 63,
    });

    const out = applyAnalystGuardrails(report, {
      thesis: "",
      bullCase: "",
      bearCase: "",
      chartReading: "",
      catalysts: [
        { text: "Timing momentum", anchorMetric: "timing_score" },
        { text: "Mystery catalyst", anchorMetric: "non_existing_metric" },
      ],
    });

    expect(out.catalysts[0]?.status).toBe("confirmed");
    expect(out.catalysts[1]?.status).toBe("speculative");
  });
});
