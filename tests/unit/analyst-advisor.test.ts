import { describe, expect, it, vi } from "vitest";
import { interpretReport } from "@/lib/analyst/interpret";
import { ReportSchema } from "@/lib/schemas/report";

vi.mock("@/lib/llm/ollama", () => ({
  chatJSON: vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        thesis: "Aufbau in Tranchen bei 90.",
        numbersSay: "Chance/Risiko liegt bei 2.4.",
        bullCase: "Operative Marge steigt.",
        bearCase: "Multiple kann komprimieren.",
        catalystNote: "Naechstes Quartal zeigt NRR-Stabilisierung.",
        entryTrigger: "Einstieg <= 90 mit Stop 80.",
        exitWatchTrigger: "Warnung bei Bruch von 80.",
        chartReading: "Trend bleibt oberhalb MA200.",
        catalysts: [{ text: "Produktzyklus", anchorMetric: "revenue_growth_yoy" }],
      },
      effectiveModel: "mock-analyst:v2",
    })
    .mockResolvedValueOnce({ data: { bearCounterpoints: ["Makro drueckt Risikoassets."] } }),
}));

vi.mock("@/lib/llm/config", () => ({
  getLLMConfig: () => ({ provider: "ollama", deepseekApiKey: "", deepseekModel: "", groqApiKey: "", groqModel: "" }),
}));

describe("analyst advisor output", () => {
  it("returns advisor fields with sourced catalysts", async () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 75,
      gate: "Green",
      confidence: "high",
      key_metrics: { revenue_growth_yoy: 0.2 },
      score_breakdown: {
        growth_market: 12,
        unit_economics_margins: 10,
        quality_moat: 12,
        valuation: 9,
        capital_discipline_dilution: 9,
        catalysts_revisions_sentiment: 10,
        ownership_smart_money: 5,
        risk_fragility: 8,
      },
      moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
      trade_setup: {
        entry_zone_max: 90,
        margin_of_safety: 0.18,
        stop_ref: 80,
        risk_reward: 2.4,
        action: "kaufen",
        sizing_hint: "normal",
        distance_to_entry_zone_pct: -0.01,
        computable: true,
      },
      timing_score: 67,
      regime: "neutral",
      quadrant: { label: "kaufen", xTimingScore: 67, yFundamentalScore: 75 },
    });

    const out = await interpretReport(
      report,
      {
        filingsAndNews: [{ title: "Q1", asOf: "2026-05-01", source: "https://example.com/q1", class: "A" }],
        segmentTrends: [],
        deterministicSignals: { timing_score: 67 },
      },
      { runId: "advisor", enabled: true, model: "mock-analyst:v2" },
    );

    expect(out).not.toBeNull();
    expect(out?.isInterpretation).toBe(true);
    expect(out?.numbersSay.length).toBeGreaterThan(0);
    expect(out?.entryTrigger).toContain("90");
    expect(out?.exitWatchTrigger).toContain("80");
    expect(out?.catalysts[0]?.sourceUrl).toBe("https://example.com/q1");
  });
});
