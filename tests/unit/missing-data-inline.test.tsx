import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSchema } from "@/lib/schemas/report";

const state = vi.hoisted(() => ({
  reportRow: { id: "r2", ticker: "MISS", reportJsonPath: "C:/tmp/report-miss.json" },
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

describe("missing data shown inline", () => {
  beforeEach(() => {
    state.report = ReportSchema.parse({
      ticker: "MISS",
      research_date: "2026-06-01",
      category: "Too Hard",
      growth_research_score: null,
      gate: "Red",
      confidence: "low",
      key_metrics: { revenue_growth_yoy: null, roic: null },
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
      moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
      run_integrity: {
        incomplete_due_to_technical_fetch_errors: true,
        retry_recommended: true,
        banner: "Technikfehler",
        fetch_statuses: [],
      },
      trade_setup: {
        entry_zone_max: null,
        margin_of_safety: null,
        stop_ref: null,
        risk_reward: null,
        action: "nicht_beurteilbar",
        sizing_hint: "nicht_beurteilbar",
        distance_to_entry_zone_pct: null,
        computable: false,
      },
      timing_score: null,
      regime: null,
      quadrant: null,
    });
  });

  it("renders missing values as inline n/a and keeps warning visible", async () => {
    const mod = await import("@/app/reports/[id]/page");
    const Page = mod.default;
    const html = renderToStaticMarkup(React.createElement(Page, { params: { id: "r2" } }));

    expect(html).toContain("Technikfehler");
    expect(html).toContain("nicht berechenbar");
    expect(html).toContain("n/a");
  });
});
