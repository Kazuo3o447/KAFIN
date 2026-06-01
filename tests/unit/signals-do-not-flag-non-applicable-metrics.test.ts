import { describe, expect, it } from "vitest";
import { deriveResearchSignals } from "@/lib/research/signals";

describe("signals do not flag non-applicable metrics", () => {
  it("does not emit Rule of 40 flag when applicability=false", () => {
    const signals = deriveResearchSignals({
      scoreTotal: 60,
      coverage: 0.8,
      confidence: "medium",
      hardBlockers: [],
      metricApplicability: {
        rule_of_40: { applicable: false },
      },
      scoreBreakdown: {
        growth_market: 10,
        unit_economics_margins: 8,
        quality_moat: 10,
        valuation: 8,
        capital_discipline_dilution: 8,
        catalysts_revisions_sentiment: 8,
        risk_fragility: 8,
      },
      keyMetrics: {
        revenue_growth_yoy: 0.04,
        revenue_cagr_3y: null,
        gross_margin: null,
        operating_margin: null,
        fcf_margin: 0.02,
        roic: null,
        rule_of_40: 20,
        rule_of_x: null,
        share_count_growth_yoy: null,
        sbc_to_revenue: null,
        net_debt_to_ebitda: null,
        beta: null,
        ntm_pe: null,
        ev_sales: null,
        ev_gross_profit: null,
        peg: null,
      },
    });

    expect(signals.redFlags.some((f) => /Rule of 40/i.test(f))).toBe(false);
  });

  it("does not map low coverage/confidence to Too Hard without hard blockers", () => {
    const signals = deriveResearchSignals({
      scoreTotal: 62,
      coverage: 0.3,
      confidence: "low",
      hardBlockers: [],
      scoreBreakdown: {
        growth_market: 11,
        unit_economics_margins: 8,
        quality_moat: 9,
        valuation: 9,
        capital_discipline_dilution: 8,
        catalysts_revisions_sentiment: 8,
        risk_fragility: 9,
      },
      keyMetrics: {
        revenue_growth_yoy: 0.12,
        revenue_cagr_3y: 0.11,
        gross_margin: 0.62,
        operating_margin: 0.14,
        fcf_margin: 0.07,
        roic: 0.11,
        rule_of_40: 19,
        rule_of_x: null,
        share_count_growth_yoy: 0.01,
        sbc_to_revenue: 0.03,
        net_debt_to_ebitda: 0.8,
        beta: 1.3,
        ntm_pe: 28,
        ev_sales: 6,
        ev_gross_profit: 10,
        peg: 1.4,
      },
    });

    expect(signals.category).not.toBe("Too Hard");
    expect(signals.redFlags.some((f) => /Datenqualitaet/i.test(f))).toBe(true);
  });
});
