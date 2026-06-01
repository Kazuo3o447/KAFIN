import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "@/lib/research/thresholds";
import { ASSUMPTIONS_VERSION } from "@/lib/research/assumptions";
import { ReportSchema } from "@/lib/schemas/report";

describe("threshold and assumption versioning", () => {
  it("exposes explicit version fields", () => {
    expect(typeof THRESHOLDS.version).toBe("string");
    expect(THRESHOLDS.version.length).toBeGreaterThan(0);
    expect(typeof ASSUMPTIONS_VERSION).toBe("string");
    expect(ASSUMPTIONS_VERSION.length).toBeGreaterThan(0);
  });

  it("report schema carries as-was interpretation defaults", () => {
    const parsed = ReportSchema.parse({
      ticker: "AXON",
      research_date: "2026-06-01",
      category: "Transitional",
      growth_research_score: 60,
      gate: "Yellow",
      confidence: "medium",
      key_metrics: {},
      score_breakdown: {
        growth_market: 0,
        unit_economics_margins: 0,
        quality_moat: 0,
        valuation: 0,
        capital_discipline_dilution: 0,
        catalysts_revisions_sentiment: 0,
        ownership_smart_money: 0,
        risk_fragility: 0,
      },
      moat_assessment: { rating: "Unknown", evidence: [], threats: [], sources: [] },
    });

    expect(parsed.score_interpretation.mode).toBe("as_was");
    expect(parsed.audit_snapshot.thresholdSetVersion).toBeDefined();
  });
});
