import { describe, expect, it } from "vitest";
import { normalizeDataset } from "@/lib/research/normalization";
import { makeDataset } from "./dataset-fixture";

describe("fx as-of normalization", () => {
  it("uses period-specific FX rates when provided", () => {
    const dataset = makeDataset();
    dataset.identity.currency = "EUR";
    dataset.prices.currency = "EUR";

    dataset.quarterly = dataset.quarterly.map((q, idx) => ({
      ...q,
      periodEnd: `2025-0${idx + 1}-30`,
      revenue: { ...q.revenue, value: 100 },
    }));

    const normalized = normalizeDataset(dataset, {
      reportingCurrency: "USD",
      fxRates: {
        "EUR_USD@2025-01-30": 1.2,
        "EUR_USD@2025-02-30": 1.3,
        "EUR_USD@2025-03-30": 1.4,
        "EUR_USD@2025-04-30": 1.5,
      },
    });

    const first = normalized.dataset.quarterly[0]?.revenue.value;
    const last = normalized.dataset.quarterly[3]?.revenue.value;
    expect(first).toBe(120);
    expect(last).toBe(150);
  });
});
