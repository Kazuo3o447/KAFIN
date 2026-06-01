import { describe, expect, it } from "vitest";
import { classifyMarketRegime } from "@/lib/research/regime";
import type { MarketContext } from "@/lib/schemas/dataset";

function ctx(partial: Partial<MarketContext>): MarketContext {
  return {
    asOf: "2026-01-01",
    indexVsMa200Pct: null,
    breadthPctAboveMa200: null,
    vix: null,
    vixPercentile1y: null,
    highYieldSpread: null,
    yieldCurve10y2y: null,
    regime: null,
    provenance: [],
    ...partial,
  };
}

describe("market regime", () => {
  it("classifies risk_on with benign inputs", () => {
    const out = classifyMarketRegime({
      marketContext: ctx({
        vixPercentile1y: 0.2,
        indexVsMa200Pct: 0.06,
        highYieldSpread: 0.04,
        yieldCurve10y2y: 0.01,
        breadthPctAboveMa200: 0.7,
      }),
    });
    expect(out.regime).toBe("risk_on");
    expect(out.breadthIsProxy).toBe(false);
  });

  it("classifies risk_off with stressed inputs", () => {
    const out = classifyMarketRegime({
      marketContext: ctx({
        vixPercentile1y: 0.85,
        indexVsMa200Pct: -0.08,
        highYieldSpread: 0.075,
        yieldCurve10y2y: -0.01,
        breadthPctAboveMa200: 0.28,
      }),
    });
    expect(out.regime).toBe("risk_off");
  });

  it("flags breadth proxy usage when breadth is missing", () => {
    const out = classifyMarketRegime({
      marketContext: ctx({
        vixPercentile1y: 0.5,
        indexVsMa200Pct: 0.01,
        highYieldSpread: 0.05,
        yieldCurve10y2y: 0.0,
        breadthPctAboveMa200: null,
      }),
      breadthProxy: 0.52,
    });
    expect(out.breadthIsProxy).toBe(true);
    expect(out.inputs.breadthPctAboveMa200).toBe(0.52);
  });
});
