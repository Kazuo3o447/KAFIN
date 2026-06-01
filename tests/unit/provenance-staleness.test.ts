import { describe, expect, it } from "vitest";
import { gatherCompanyDataset } from "@/lib/providers/collect";
import type { Capability, DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

function singleProvider(fetcher: (cap: Capability, ctx: ProviderContext) => Promise<ProviderFetchResultV2>): DataProviderV2 {
  return {
    name: "stale-provider",
    capabilities: ["prices"],
    available: () => true,
    priorityByCapability: { prices: 1 },
    fetch: fetcher,
  };
}

describe("provenance staleness", () => {
  it("marks stale=true when asOf is older than configured threshold", async () => {
    const provider = singleProvider(async (cap) => ({
      provider: "stale-provider",
      capability: cap,
      ok: true,
      data: {
        currency: "USD",
        daily: Array.from({ length: 252 * 3 }, (_, i) => ({
          date: `2023-01-${String((i % 28) + 1).padStart(2, "0")}`,
          close: 100,
          volume: 1000,
        })),
      },
      provenance: [
        {
          source: "stale-provider",
          url: "https://example.com/prices",
          klass: "B",
          asOf: "2020-01-01",
          stale: false,
        },
      ],
      raw: [],
      durationMs: 1,
    }));

    const dataset = await gatherCompanyDataset("MSFT", {
      providers: [provider],
      asOf: "2026-06-01",
      runId: "stale-test",
      skipSymbolResolution: true,
    });

    expect(dataset.prices.provenance[0]?.stale).toBe(true);
    expect(dataset.coverage.growth.anyStale).toBe(true);
  });
});
