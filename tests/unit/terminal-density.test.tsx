import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSchema } from "@/lib/schemas/report";

const state = vi.hoisted(() => ({
  reportRow: { id: "r1", ticker: "TEST", reportJsonPath: "C:/tmp/report.json" },
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

vi.mock("@/lib/research/score-history", () => ({
  loadScoreHistory: () => [
    { scoreTotal: 61 },
    { scoreTotal: 64 },
    { scoreTotal: 67 },
    { scoreTotal: 70 },
  ],
}));

vi.mock("@/components/ExportButtons", () => ({ ExportButtons: () => React.createElement("div", null, "export") }));
vi.mock("@/components/PinButton", () => ({ PinButton: () => React.createElement("div", null, "pin") }));

describe("terminal density layout", () => {
  beforeEach(() => {
    state.report = ReportSchema.parse({
      ticker: "TEST",
      company_name: "Terminal Co",
      exchange: "NASDAQ",
      research_date: "2026-06-01",
      category: "Quality Growth",
      growth_research_score: 70,
      gate: "Green",
      confidence: "medium",
      key_metrics: { revenue_growth_yoy: 0.2, roic: 0.15, fcf_margin: 0.12 },
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
      fair_value: {
        currency: "USD",
        current_price: 100,
        point_estimate: 120,
        range_low: 92,
        range_high: 132,
        upside_pct: 0.2,
        classification: "fair",
        methods: [],
        reverse_dcf: null,
        confidence: "medium",
        applicable_method_count: 0,
        rationale_short: "",
        asof: "2026-06-01",
      },
      trade_setup: {
        entry_zone_max: 92,
        margin_of_safety: 0.18,
        stop_ref: 84,
        risk_reward: 2.1,
        action: "warten",
        sizing_hint: "normal",
        distance_to_entry_zone_pct: 0.05,
        computable: true,
      },
      timing_score: 61,
      regime: "neutral",
      quadrant: { label: "warten", xTimingScore: 61, yFundamentalScore: 70 },
    });
  });

  it("renders dense panels and no mandatory accordion markup", async () => {
    const mod = await import("@/app/reports/[id]/page");
    const Page = mod.default;
    const html = renderToStaticMarkup(React.createElement(Page, { params: { id: "r1" } }));

    expect(html).toContain("trade-setup-panel");
    expect(html).toContain("market-regime-panel");
    expect(html).toContain("metrics-panel");
    expect(html).toContain("charts-row");
    expect(html).toContain("ownership-panel");
    expect(html).not.toContain("CollapsibleSection");
  });
});
