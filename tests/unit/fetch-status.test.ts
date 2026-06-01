import { describe, expect, it } from "vitest";
import { gatherCompanyDatasetDetailed } from "@/lib/providers/collect";
import type { Capability, DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

function provider(
  name: string,
  capabilities: Capability[],
  fetcher: (cap: Capability, ctx: ProviderContext) => Promise<ProviderFetchResultV2>,
): DataProviderV2 {
  return {
    name,
    capabilities,
    available: () => true,
    priorityByCapability: Object.fromEntries(capabilities.map((c) => [c, 1])),
    fetch: fetcher,
  };
}

describe("fetch status diagnostics", () => {
  it("marks timeout-like failures as fetch_failed and run incomplete", async () => {
    const failing = provider("failing", ["prices"], async (cap) => ({
      provider: "failing",
      capability: cap,
      ok: false,
      data: null,
      provenance: [],
      raw: [],
      error: "network timeout",
      durationMs: 1,
    }));

    const result = await gatherCompanyDatasetDetailed("MSFT", {
      providers: [failing],
      asOf: "2026-06-01",
      runId: "fetch-status-timeout",
      skipSymbolResolution: true,
    });

    const prices = result.diagnostics.capabilities.find((d) => d.capability === "prices");
    expect(prices?.status).toBe("fetch_failed");
    expect(result.diagnostics.incompleteDueToTechnicalFailure).toBe(true);
    expect(result.diagnostics.retryRecommended).toBe(true);
  });
});
