import { describe, expect, it } from "vitest";
import { detectValuationRegime } from "@/lib/research/valuation";
import { deriveMetricsFromDataset } from "@/lib/research/derived-metrics";
import { makeDataset } from "./dataset-fixture";
import { THRESHOLDS } from "@/lib/research/thresholds";

describe("valuation regime", () => {
  it("classifies emerging as pre-profit", () => {
    const dataset = makeDataset("emerging");
    dataset.annual[dataset.annual.length - 1]!.ebit.value = -2;
    const m = deriveMetricsFromDataset(dataset);
    expect(detectValuationRegime(dataset, m)).toBe("pre_profit");
  });

  it("classifies quality as mature", () => {
    const dataset = makeDataset("quality");
    const m = deriveMetricsFromDataset(dataset);
    expect(detectValuationRegime(dataset, m)).toBe("mature");
  });

  it("classifies volatile margins as cyclical", () => {
    const dataset = makeDataset("cyclical");
    const m = deriveMetricsFromDataset(dataset);
    m.operatingMarginStddev = THRESHOLDS.valuation_cyclical_margin_stddev + 0.05;
    m.revenueCagr3y = 0.06;
    expect(detectValuationRegime(dataset, m)).toBe("cyclical");
  });

  it("does not default growth profile to cyclical", () => {
    const dataset = makeDataset("quality");
    dataset.identity.sector = null;
    dataset.identity.industry = null;
    const m = deriveMetricsFromDataset(dataset);
    expect(detectValuationRegime(dataset, m)).toBe("mature");
  });
});
