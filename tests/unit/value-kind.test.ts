import { describe, expect, it } from "vitest";
import { TrackedNumberSchema, tracked } from "@/lib/schemas/dataset";
import { ReportSchema } from "@/lib/schemas/report";

describe("value kind", () => {
  it("assigns default kind=actual for tracked values", () => {
    const parsed = TrackedNumberSchema.parse({
      value: 12,
      provenance: {
        source: "test",
        url: "https://example.com",
        klass: "B",
        asOf: "2026-06-01",
        stale: false,
      },
    });

    expect(parsed.kind).toBe("actual");
  });

  it("supports explicit estimate/derived kinds", () => {
    const estimate = tracked(100, {
      source: "test",
      url: "https://example.com",
      klass: "B",
      asOf: "2026-06-01",
      stale: false,
    }, "estimate");

    expect(estimate.kind).toBe("estimate");
  });

  it("stores assumptions as kind=assumption in report", () => {
    const parsed = ReportSchema.parse({
      ticker: "TEST",
      research_date: "2026-06-01",
      category: "Transitional",
      growth_research_score: 55,
      gate: "Yellow",
      confidence: "medium",
      key_metrics: {},
      score_breakdown: {
        growth_market: 8,
        unit_economics_margins: 8,
        quality_moat: 8,
        valuation: 8,
        capital_discipline_dilution: 8,
        catalysts_revisions_sentiment: 8,
        risk_fragility: 8,
      },
      moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
      assumptions: [
        {
          id: "dcf_terminal_growth",
          label: "DCF Terminal Growth",
          value: 0.03,
          unit: "ratio",
          rationale: "Conservative perpetual growth anchor.",
          kind: "assumption",
        },
      ],
    });

    expect(parsed.assumptions[0]?.kind).toBe("assumption");
  });
});
