import { describe, expect, it, vi } from "vitest";
import { interpretReport } from "@/lib/analyst/interpret";
import { ReportSchema } from "@/lib/schemas/report";

const mocks = vi.hoisted(() => ({
  chatJSON: vi.fn(),
}));

vi.mock("@/lib/llm/ollama", () => ({ chatJSON: mocks.chatJSON }));
vi.mock("@/lib/llm/config", () => ({
  getLLMConfig: () => ({ provider: "ollama", deepseekApiKey: "", deepseekModel: "", groqApiKey: "", groqModel: "" }),
}));

describe("model audit", () => {
  it("stores the actually executed model", async () => {
    mocks.chatJSON
      .mockResolvedValueOnce({
        data: {
          thesis: "Score 70.",
          bullCase: "Setup aligns.",
          bearCase: "Downside exists.",
          chartReading: "RSI neutral.",
          catalysts: [],
        },
        effectiveModel: "provider/model:2026-01",
      })
      .mockResolvedValueOnce({ data: { bearCounterpoints: [] } });

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

    const analyst = await interpretReport(report, {
      filingsAndNews: [],
      segmentTrends: [],
      deterministicSignals: {},
    }, {
      runId: "audit",
      enabled: true,
      model: "requested-model",
    });

    expect(analyst?.model.name).toBe("provider/model:2026-01");
    expect(mocks.chatJSON).toHaveBeenCalled();
  });
});
