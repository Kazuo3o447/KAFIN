import { describe, it, expect } from "vitest";
import { KPI_LAYOUTS, DEFAULT_KPI_LAYOUT } from "@/components/ScoreKpiStrip";

describe("KPI_LAYOUTS", () => {
  it("SaaS includes NRR", () => {
    const keys = KPI_LAYOUTS.SaaS.map((k) => k.key);
    expect(keys).toContain("net_revenue_retention");
  });

  it("SaaS does NOT include Net Debt/EBITDA", () => {
    const keys = KPI_LAYOUTS.SaaS.map((k) => k.key);
    expect(keys).not.toContain("net_debt_to_ebitda");
  });

  it("Semiconductor includes Net Debt/EBITDA", () => {
    const keys = KPI_LAYOUTS.Semiconductor.map((k) => k.key);
    expect(keys).toContain("net_debt_to_ebitda");
  });

  it("Semiconductor does NOT include NRR", () => {
    const keys = KPI_LAYOUTS.Semiconductor.map((k) => k.key);
    expect(keys).not.toContain("net_revenue_retention");
  });

  it("all defined layouts have exactly 8 KPIs", () => {
    for (const [model, defs] of Object.entries(KPI_LAYOUTS)) {
      expect(defs, `${model} should have 8 KPIs`).toHaveLength(8);
    }
  });

  it("DEFAULT_KPI_LAYOUT has 8 KPIs", () => {
    expect(DEFAULT_KPI_LAYOUT).toHaveLength(8);
  });
});
