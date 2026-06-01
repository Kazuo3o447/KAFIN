import { describe, expect, it } from "vitest";
import { buildFairValueCorridor, detectValuationRegime } from "@/lib/research/valuation";
import { deriveMetricsFromDataset } from "@/lib/research/derived-metrics";
import { makeDataset } from "./dataset-fixture";

describe("valuation stability", () => {
  it("builds non-empty corridor when stable methods survive", () => {
    const dataset = makeDataset("quality");
    const m = deriveMetricsFromDataset(dataset);
    const regime = detectValuationRegime(dataset, m);
    const corridor = buildFairValueCorridor(dataset, m, regime);

    expect(corridor.methods.some((x) => x.enabled)).toBe(true);
    expect(corridor.median).not.toBeNull();
    expect(corridor.min).not.toBeNull();
    expect(corridor.max).not.toBeNull();
  });

  it("keeps all selected methods above minimum stability", () => {
    const dataset = makeDataset("quality");
    const m = deriveMetricsFromDataset(dataset);
    const regime = detectValuationRegime(dataset, m);
    const corridor = buildFairValueCorridor(dataset, m, regime);

    for (const method of corridor.methods.filter((x) => x.enabled && x.fairValue !== null)) {
      expect(method.stability).toBeGreaterThanOrEqual(0);
      expect(method.stability).toBeLessThanOrEqual(1);
    }
  });
});
