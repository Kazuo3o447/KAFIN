import { describe, expect, it, vi } from "vitest";
import { interpretReport } from "@/lib/analyst/interpret";
import { ReportSchema } from "@/lib/schemas/report";

vi.mock("@/lib/llm/ollama", () => ({
  chatJSON: vi.fn()
    .mockResolvedValueOnce({
      data: {
        thesis: "Score is 70.",
        bullCase: "Momentum at 60% supports setup.",
        bearCase: "Valuation could compress.",
        chartReading: "RSI remains stable.",
        catalysts: [{ text: "Revisions improving", anchorMetric: "timing_score" }],
      },
      effectiveModel: "mock-model:v1",
    })
    .mockResolvedValueOnce({ data: { bearCounterpoints: ["Macro risk rising"] } }),
}));

vi.mock("@/lib/llm/config", () => ({
  getLLMConfig: () => ({ provider: "ollama", deepseekApiKey: "", deepseekModel: "", groqApiKey: "", groqModel: "" }),
}));

describe("analyst immutability", () => {
  it("does not mutate deterministic report fields", async () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 70,
      gate: "Green",
      confidence: "medium",
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
      timing_score: 60,
      regime: "neutral",
      quadrant: { label: "warten", xTimingScore: 60, yFundamentalScore: 70 },
    });

    const before = JSON.stringify(report);
    await interpretReport(report, {
      filingsAndNews: [],
      segmentTrends: [],
      deterministicSignals: {},
    }, {
      runId: "immut",
      enabled: true,
      model: "mock-model:v1",
    });
    const after = JSON.stringify(report);

    expect(after).toBe(before);
  });
});
