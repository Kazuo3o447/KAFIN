import { describe, expect, it } from "vitest";
import { gatherCompanyDataset } from "@/lib/providers/collect";
import type { Capability, DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

function provider(
  name: string,
  capabilities: Capability[],
  priority: number,
  fetcher: (cap: Capability, ctx: ProviderContext) => Promise<ProviderFetchResultV2>,
): DataProviderV2 {
  return {
    name,
    capabilities,
    available: () => true,
    priorityByCapability: Object.fromEntries(capabilities.map((c) => [c, priority])),
    fetch: fetcher,
  };
}

describe("collect degradation", () => {
  it("falls back to next provider when primary fails", async () => {
    const primary = provider("primary", ["prices"], 1, async (cap) => ({
      provider: "primary",
      capability: cap,
      ok: false,
      data: null,
      provenance: [],
      raw: [],
      error: "boom",
      durationMs: 1,
    }));

    const fallback = provider("fallback", ["prices"], 2, async (cap, ctx) => ({
      provider: "fallback",
      capability: cap,
      ok: true,
      data: {
        currency: "USD",
        daily: Array.from({ length: 252 * 3 }, (_, i) => ({
          date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
          close: 100 + i,
          volume: 10_000,
        })),
      },
      provenance: [{ source: "fallback", url: "https://example.com/prices", klass: "B", asOf: ctx.runDate, stale: false }],
      raw: [],
      durationMs: 1,
    }));

    const dataset = await gatherCompanyDataset("MSFT", {
      providers: [primary, fallback],
      asOf: "2026-06-01",
      runId: "test-run",
      skipSymbolResolution: true,
    });

    expect(dataset.prices.daily.length).toBeGreaterThanOrEqual(252 * 3);
    expect(dataset.coverage.growth.filled).toBeGreaterThan(0);
  });

  it("keeps unsupported capabilities null/empty without throwing", async () => {
    const onlyPrices = provider("only-prices", ["prices"], 1, async (cap, ctx) => ({
      provider: "only-prices",
      capability: cap,
      ok: true,
      data: {
        currency: "USD",
        daily: [{ date: "2026-05-30", close: 100, volume: 1000 }],
      },
      provenance: [{ source: "only-prices", url: "https://example.com", klass: "B", asOf: ctx.runDate, stale: false }],
      raw: [],
      durationMs: 1,
    }));

    const dataset = await gatherCompanyDataset("SAP.DE", {
      providers: [onlyPrices],
      asOf: "2026-06-01",
      runId: "test-run-2",
      skipSymbolResolution: true,
    });

    expect(dataset.insiderTransactions).toEqual([]);
    expect(dataset.ownership.institutionalPctHeld).toBeNull();
    expect(dataset.shortInterest.pctOfFloat).toBeNull();
  });
});
