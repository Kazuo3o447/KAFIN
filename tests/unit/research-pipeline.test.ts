import { describe, expect, it } from "vitest";
import { buildResearchContext } from "@/lib/research/context";
import { deriveKeyMetrics } from "@/lib/research/derived-metrics";
import { deriveResearchSignals, buildMoatAssessment } from "@/lib/research/signals";
import { validateBlockSources } from "@/lib/research/source-validation";
import type { ProviderFact } from "@/lib/providers/types";
import type { BlockKey } from "@/lib/scoring/weights";

const baseUrl = "https://example.com/source";

function fact(field: string, value: unknown, url = baseUrl): ProviderFact {
  return {
    field,
    value,
    url,
    title: field,
    asOf: "2026-05-22",
    klass: "B",
  };
}

describe("research pipeline helpers", () => {
  it("derives expensive key metrics deterministically", () => {
    const facts: ProviderFact[] = [
      fact("revenue_growth_yoy", 0.3),
      fact("revenue_ttm", 100),
      fact("free_cashflow", 10),
      fact("total_debt", 50),
      fact("total_cash", 20),
      fact("ebitda", 10),
      fact("gross_margin", 0.5),
      fact("enterprise_value", 300),
      fact("fmp_income_statement_q", [
        { date: "2025-12-31", revenue: 133.1, weightedAverageShsOutDil: 105 },
        { date: "2024-12-31", revenue: 121, weightedAverageShsOutDil: 100 },
        { date: "2023-12-31", revenue: 110, weightedAverageShsOutDil: 98 },
        { date: "2022-12-31", revenue: 100, weightedAverageShsOutDil: 97 },
      ]),
      fact("fmp_cashflow_q", [{ date: "2025-12-31", stockBasedCompensation: 12 }]),
    ];

    const result = deriveKeyMetrics("ABC", "2026-05-22", facts);

    expect(result.metrics.fcf_margin).toBe(0.1);
    expect(result.metrics.rule_of_40).toBe(40);
    expect(result.metrics.rule_of_x).toBe(70);
    expect(result.metrics.net_debt_to_ebitda).toBe(3);
    expect(result.metrics.ev_gross_profit).toBe(6);
    expect(result.metrics.revenue_cagr_3y).toBeCloseTo(0.1, 2);
    expect(result.metrics.share_count_growth_yoy).toBe(0.05);
    expect(result.metrics.sbc_to_revenue).toBe(0.12);
    expect(result.facts.some((f) => f.field === "derived_rule_of_40")).toBe(true);
  });

  it("builds block-specific context at line boundaries", () => {
    const facts: ProviderFact[] = [
      fact("revenue_growth_yoy", 0.25),
      fact("fmp_balance_sheet_q", { totalDebt: 10, totalCash: 20, rows: Array.from({ length: 100 }, (_, i) => i) }),
      fact("news_google_0", { title: "ABC launches product", snippet: "ABC stock reacts to product launch" }),
    ];
    const blocks: BlockKey[] = [
      "growth_market",
      "capital_discipline_dilution",
      "catalysts_revisions_sentiment",
    ];

    const ctx = buildResearchContext(facts, blocks);

    expect(ctx.context.length).toBeLessThanOrEqual(32_000 + 120);
    expect(ctx.blockContexts.capital_discipline_dilution).toContain("fmp_balance_sheet_q");
    expect(ctx.blockContexts.growth_market).toContain("revenue_growth_yoy");
    expect(ctx.blockContexts.capital_discipline_dilution.includes("[context truncated at line boundary]")).toBe(false);
  });

  it("classifies dilution traps and hype risk from block scores plus metrics", () => {
    const scoreBreakdown = {
      growth_market: 12,
      unit_economics_margins: 8,
      quality_moat: 10,
      valuation: 8,
      capital_discipline_dilution: 3,
      catalysts_revisions_sentiment: 7,
      risk_fragility: 7,
    };

    const dilution = deriveResearchSignals({
      scoreTotal: 68,
      coverage: 0.8,
      confidence: "medium",
      hardBlockers: [],
      scoreBreakdown,
      keyMetrics: {
        revenue_growth_yoy: 0.22,
        revenue_cagr_3y: null,
        gross_margin: null,
        operating_margin: null,
        fcf_margin: 0.02,
        roic: null,
        rule_of_40: null,
        rule_of_x: null,
        share_count_growth_yoy: 0.05,
        sbc_to_revenue: 0.12,
        net_debt_to_ebitda: null,
        beta: null,
        ntm_pe: null,
        ev_sales: null,
        ev_gross_profit: null,
        peg: null,
      },
    });
    expect(dilution.category).toBe("Dilution Trap");
    expect(dilution.redFlags).toContain("SBC / Revenue > 10%.");

    const hype = deriveResearchSignals({
      scoreTotal: 75,
      coverage: 0.8,
      confidence: "medium",
      hardBlockers: [],
      scoreBreakdown: { ...scoreBreakdown, capital_discipline_dilution: 8, valuation: 4 },
      keyMetrics: {
        ...dilutionFixtureMetrics(),
        fcf_margin: -0.08,
        share_count_growth_yoy: 0.01,
        sbc_to_revenue: 0.03,
      },
    });
    expect(hype.category).toBe("Hype/Risk");
  });

  it("removes source references that do not support the indicator rationale", () => {
    const checked = validateBlockSources(
      {
        indicators: [
          { name: "revenue_growth_quality", score: 8, rationale: "Revenue growth was 30%.", sourceIdx: 2 },
        ],
        red_flags: [],
      },
      new Map([
        [1, "revenue_growth_yoy: 0.3"],
        [2, "beta: 1.2"],
      ]),
    );

    expect(checked.indicators[0]?.sourceIdx).toBeNull();
    expect(checked.invalid_source_refs).toHaveLength(1);
    expect(checked.red_flags?.[0]).toContain("Unsichere Quellenreferenz");
  });

  it("builds a moat assessment instead of leaving Unknown hardcoded", () => {
    const moat = buildMoatAssessment(
      {
        indicators: [
          { name: "moat_source_evidence", score: 9, rationale: "Switching costs are visible.", sourceIdx: 1 },
          { name: "quantitative_moat_trace", score: 8, rationale: "ROIC and gross margin are strong.", sourceIdx: 2 },
        ],
        red_flags: [],
      },
      new Map([
        [1, { url: "https://example.com/10k" }],
        [2, { url: "https://example.com/metrics" }],
      ]),
    );

    expect(moat.rating).toBe("Wide");
    expect(moat.sources).toEqual(["https://example.com/10k", "https://example.com/metrics"]);
    expect(moat.evidence.length).toBeGreaterThan(0);
  });
});

function dilutionFixtureMetrics() {
  return {
    revenue_growth_yoy: 0.22,
    revenue_cagr_3y: null,
    gross_margin: null,
    operating_margin: null,
    fcf_margin: 0.02,
    roic: null,
    rule_of_40: null,
    rule_of_x: null,
    share_count_growth_yoy: 0.01,
    sbc_to_revenue: 0.03,
    net_debt_to_ebitda: null,
    beta: 1.2,
    ntm_pe: null,
    ev_sales: null,
    ev_gross_profit: null,
    peg: null,
  };
}
