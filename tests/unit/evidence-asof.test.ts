import { describe, expect, it } from "vitest";
import { buildAnalystEvidence } from "@/lib/analyst/evidence";
import { ReportSchema } from "@/lib/schemas/report";
import { makeDataset } from "./dataset-fixture";

describe("analyst evidence as-of filtering", () => {
  it("drops evidence entries without as-of", () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 70,
      gate: "Green",
      confidence: "medium",
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

    const evidence = buildAnalystEvidence(
      report,
      makeDataset("quality"),
      [
        {
          field: "rss_news_1",
          value: { headline: "A" },
          url: "https://example.com/a",
          title: "A",
          asOf: "2026-05-31",
          klass: "C",
        },
        {
          field: "rss_news_2",
          value: { headline: "B" },
          url: "https://example.com/b",
          title: "B",
          asOf: null,
          klass: "C",
        },
      ],
    );

    expect(evidence.filingsAndNews).toHaveLength(1);
    expect(evidence.filingsAndNews[0]?.title).toBe("A");
  });
});
