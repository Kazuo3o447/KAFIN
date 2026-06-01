import { describe, expect, it } from "vitest";
import { interpretReport } from "@/lib/analyst/interpret";
import { ReportSchema } from "@/lib/schemas/report";

describe("analyst optional", () => {
  it("returns null when disabled", async () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 75,
      gate: "Green",
      confidence: "high",
      key_metrics: {},
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
    });

    const analyst = await interpretReport(report, {
      filingsAndNews: [],
      segmentTrends: [],
      deterministicSignals: {},
    }, {
      runId: "test",
      enabled: false,
    });

    expect(analyst).toBeNull();
  });
});
