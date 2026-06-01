import { describe, expect, it } from "vitest";
import { normalizeDataset } from "@/lib/research/normalization";
import { makeDataset } from "./dataset-fixture";

describe("normalization", () => {
  it("converts monetary values into reporting currency", () => {
    const dataset = makeDataset("quality");
    dataset.identity.currency = "EUR";
    dataset.prices.currency = "EUR";

    const before = dataset.annual[dataset.annual.length - 1]!.revenue.value!;
    const out = normalizeDataset(dataset, {
      reportingCurrency: "USD",
      fxRates: { EUR_USD: 1.1 },
    });

    const after = out.dataset.annual[out.dataset.annual.length - 1]!.revenue.value!;
    expect(after).toBeCloseTo(before * 1.1, 6);
    expect(out.reportingCurrency).toBe("USD");
    expect(out.originalCurrency).toBe("EUR");
  });

  it("builds TTM from latest four fiscal quarters", () => {
    const dataset = makeDataset("quality");
    dataset.quarterly = dataset.quarterly.map((q, i) => ({
      ...q,
      periodEnd: ["2025-08-31", "2025-11-30", "2026-02-28", "2026-05-31", "2026-08-31", "2026-11-30", "2027-02-28", "2027-05-31"][i]!,
      revenue: { ...q.revenue, value: 10 + i },
      ebit: { ...q.ebit, value: 2 + i },
      freeCashflow: { ...q.freeCashflow, value: 1 + i },
      stockBasedComp: { ...q.stockBasedComp, value: 0.2 + i * 0.01 },
    }));

    const out = normalizeDataset(dataset);
    expect(out.ttm.revenue).toBe(14 + 15 + 16 + 17);
    expect(out.ttm.ebit).toBe(6 + 7 + 8 + 9);
    expect(out.ttm.freeCashflow).toBe(5 + 6 + 7 + 8);
  });

  it("keeps gaap and adjusted streams separated", () => {
    const dataset = makeDataset("quality");
    const out = normalizeDataset(dataset, { sbcAdjustmentRatio: 1 });

    expect(out.gaapVsAdjusted.gaap.freeCashflow).not.toBeNull();
    expect(out.gaapVsAdjusted.adjusted.freeCashflowAfterSbc).not.toBeNull();
    expect(out.gaapVsAdjusted.adjusted.freeCashflowAfterSbc).not.toEqual(out.gaapVsAdjusted.gaap.freeCashflow);
  });
});
