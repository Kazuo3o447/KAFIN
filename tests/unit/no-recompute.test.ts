import { describe, expect, it } from "vitest";
import { applyAnalystGuardrails } from "@/lib/analyst/guardrails";
import { ReportSchema } from "@/lib/schemas/report";

describe("no recompute from analyst text", () => {
  it("keeps only entry/exit trigger numbers that match deterministic trade setup", () => {
    const report = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 72,
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
        ownership_smart_money: 4,
        risk_fragility: 8,
      },
      moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
      trade_setup: {
        entry_zone_max: 90,
        margin_of_safety: 0.18,
        stop_ref: 80,
        risk_reward: 2.0,
        action: "kaufen",
        sizing_hint: "normal",
        distance_to_entry_zone_pct: -0.03,
        computable: true,
      },
      timing_score: 60,
      regime: "neutral",
      quadrant: { label: "kaufen", xTimingScore: 60, yFundamentalScore: 72 },
    });

    const out = applyAnalystGuardrails(report, {
      thesis: "",
      numbersSay: "",
      bullCase: "",
      bearCase: "",
      catalystNote: "",
      entryTrigger: "Einstieg bei 75 und Stop bei 70.",
      exitWatchTrigger: "Warnung unter 80.",
      chartReading: "",
      catalysts: [],
    });

    expect(out.entryTrigger).toBe("");
    expect(out.exitWatchTrigger).toContain("80");
    expect(out.removedNumbers).toContain("75");
    expect(out.removedNumbers).toContain("70");
  });
});
