import { describe, expect, it } from "vitest";
import { computeOwnershipSignals } from "@/lib/research/ownership-signals";
import { makeDataset } from "./dataset-fixture";

describe("ownership signals", () => {
  it("detects insider cluster buy setup", () => {
    const dataset = makeDataset("quality");
    const out = computeOwnershipSignals(dataset);

    expect(out.clusterBuy).toBe(true);
    expect(out.buySellRatio).not.toBeNull();
    expect(out.ownershipScore).toBeGreaterThanOrEqual(0);
  });

  it("marks short risk when short interest is high and no squeeze", () => {
    const dataset = makeDataset("emerging");
    dataset.analyst.upgrades3m = 0;
    dataset.analyst.downgrades3m = 4;
    dataset.insiderTransactions = [];

    const out = computeOwnershipSignals(dataset);
    expect(out.squeezeSetup).toBe(false);
    expect(out.shortRisk).toBe(true);
  });
});
