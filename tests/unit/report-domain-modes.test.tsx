import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSchema } from "@/lib/schemas/report";

const state = vi.hoisted(() => ({
  reportRow: { id: "r-domain", ticker: "MODE", reportJsonPath: "C:/tmp/report-domain.json" },
  watchlistRow: null as null | Record<string, unknown>,
  report: {},
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify(state.report)),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
}));

vi.mock("@/lib/storage/db", () => {
  const schema = {
    reports: { id: "reports.id" },
    watchlist: { ticker: "watchlist.ticker" },
  };

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          get: () => (table === schema.reports ? state.reportRow : state.watchlistRow),
        }),
      }),
    }),
  };

  return { db, schema };
});

vi.mock("@/lib/research/score-history", () => ({ loadScoreHistory: () => [] }));
vi.mock("@/components/ExportButtons", () => ({ ExportButtons: () => React.createElement("div", null, "export") }));
vi.mock("@/components/PinButton", () => ({ PinButton: () => React.createElement("div", null, "pin") }));

function makeBaseReport() {
  return {
    ticker: "MODE",
    company_name: "Mode Corp",
    research_date: "2026-06-02",
    category: "Transitional" as const,
    growth_research_score: 64,
    gate: "Yellow" as const,
    confidence: "medium" as const,
    key_metrics: { revenue_growth_yoy: 0.2, roic: 0.1, fcf_margin: 0.12 },
    score_breakdown: {
      growth_market: 10,
      unit_economics_margins: 8,
      quality_moat: 9,
      valuation: 7,
      capital_discipline_dilution: 6,
      catalysts_revisions_sentiment: 5,
      ownership_smart_money: 4,
      risk_fragility: 6,
    },
    moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
    trade_setup: {
      entry_zone_max: null,
      margin_of_safety: null,
      stop_ref: null,
      risk_reward: null,
      action: "warten" as const,
      sizing_hint: "nicht_beurteilbar" as const,
      distance_to_entry_zone_pct: null,
      computable: false,
    },
    timing_score: null,
    regime: null,
    quadrant: null,
    technicals: null,
    fair_value: null,
    source_list: [],
  };
}

describe("report page domain modes", () => {
  beforeEach(() => {
    state.report = ReportSchema.parse({
      ...makeBaseReport(),
      analysis_domain: "fundamental",
      axes: [
        { axis: "growth", quant: { value: 70, coverage: 1, inputs: [], source: "quant" }, ki: null, combined: 70, divergence: null, kiWeightEffective: 0, rating: null },
        { axis: "finance", quant: { value: 65, coverage: 1, inputs: [], source: "quant" }, ki: null, combined: 65, divergence: null, kiWeightEffective: 0, rating: null },
        { axis: "moat", quant: { value: 55, coverage: 1, inputs: [], source: "quant" }, ki: null, combined: 55, divergence: null, kiWeightEffective: 0, rating: null },
      ],
    });
  });

  it("renders the standard scorecard for fundamental reports", async () => {
    const mod = await import("@/app/reports/[id]/page");
    const Page = mod.default;
    const html = renderToStaticMarkup(React.createElement(Page, { params: { id: "r-domain" } }));

    expect(html).toContain("Score &amp; Gate");
    expect(html).toContain("64.00 / 100");
  });

  it("renders the qualitative thesis layout without a fake 0-100 score", async () => {
    state.report = ReportSchema.parse({
      ...makeBaseReport(),
      analysis_domain: "qualitative",
      analysis_domain_reasons: ["Framework ai_infrastructure_neocloud is structurally pre-fundamental."],
      growth_research_score: null,
      qualitative_thesis: {
        verdict: "spekulativ_chance",
        conviction: "medium",
        backlog: [{ claim: "NVIDIA 5 GW AI infrastructure agreement", sourceUrl: "https://example.com/nvda", sourceDate: "2026-06-01", claimType: "backlog" }],
        capacity: [{ claim: "Capacity expansion to new data center campuses", sourceUrl: "https://example.com/capacity", sourceDate: "2026-06-01", claimType: "capacity" }],
        financing: [{ claim: "Microsoft financing package of $3.65 billion", sourceUrl: "https://example.com/msft", sourceDate: "2026-06-01", claimType: "financing" }],
        keyPartners: [{ claim: "Dell infrastructure support worth $1.6 billion", sourceUrl: "https://example.com/dell", sourceDate: "2026-06-01", claimType: "partner" }],
        executionRisks: ["Capacity build-out must convert into utilization."],
        dilutionRisk: "Finanzierungsbedarf beobachten",
        bull: [{ claim: "NVIDIA 5 GW AI infrastructure agreement", sourceUrl: "https://example.com/nvda", sourceDate: "2026-06-01", claimType: "bull" }],
        bear: [{ claim: "Microsoft financing package of $3.65 billion", sourceUrl: "https://example.com/msft", sourceDate: "2026-06-01", claimType: "bear" }],
        catalysts: [{ claim: "Dell infrastructure support worth $1.6 billion", sourceUrl: "https://example.com/dell", sourceDate: "2026-06-01", claimType: "catalyst" }],
        falsification: ["Deals fail to convert into revenue."],
      },
      plausibility_flags: [{ code: "revenue_growth_implausible", metric: "revenue_growth_yoy", severity: "suppress", message: "Revenue growth should not drive the verdict." }],
      axes: [],
    });

    const mod = await import("@/app/reports/[id]/page");
    const Page = mod.default;
    const html = renderToStaticMarkup(React.createElement(Page, { params: { id: "r-domain" } }));

    expect(html).toContain("Nicht fundamental bewertbar");
    expect(html).toContain("NVIDIA 5 GW AI infrastructure agreement");
    expect(html).not.toContain("/ 100 ·");
  });

  it("renders the data-incomplete panel for missing-data runs", async () => {
    state.report = ReportSchema.parse({
      ...makeBaseReport(),
      analysis_domain: "data_incomplete",
      analysis_domain_reasons: ["Technical fetch failure marked run incomplete."],
      growth_research_score: null,
      trader_cockpit: {
        actionability: "data_insufficient",
        primary_blocker: "Technical fetch failure marked run incomplete.",
        blocker_type: "data_quality",
        data_quality_label: "weak",
        critical_missing_data: ["revenue_growth_yoy", "roic"],
        top_bull_points: [],
        top_bear_points: [],
        next_recheck_trigger: null,
      },
      axes: [],
    });

    const mod = await import("@/app/reports/[id]/page");
    const Page = mod.default;
    const html = renderToStaticMarkup(React.createElement(Page, { params: { id: "r-domain" } }));

    expect(html).toContain("daten unvollständig");
    expect(html).toContain("Technical fetch failure marked run incomplete.");
    expect(html).toContain("revenue_growth_yoy · roic");
  });
});