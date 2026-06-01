import { describe, expect, it } from "vitest";
import { scoreCompany } from "@/lib/scoring/engine";
import { buildTimingOutput } from "@/lib/scoring/timing";
import { computeTechnicals } from "@/lib/research/technicals";
import { computeEstimatesSignals } from "@/lib/research/estimates-signals";
import { computeOwnershipSignals } from "@/lib/research/ownership-signals";
import { makeDataset } from "./dataset-fixture";

describe("timing orthogonality", () => {
  it("does not alter fundamental score when timing is computed", () => {
    const dataset = makeDataset("quality");
    const base = scoreCompany(dataset, "quality_compounder");

    const technicals = computeTechnicals({
      price: dataset.prices.daily,
      benchmark: dataset.prices.daily,
      sectorBenchmark: dataset.prices.daily,
    });

    buildTimingOutput(
      base,
      {
        technicals,
        estimatesSignals: computeEstimatesSignals(dataset),
        ownershipSignals: {
          squeezeSetup: computeOwnershipSignals(dataset).squeezeSetup,
          shortRisk: computeOwnershipSignals(dataset).shortRisk,
        },
      },
      "risk_off",
    );

    const after = scoreCompany(dataset, "quality_compounder");
    expect(after.score).toEqual(base.score);
    expect(after.blockBreakdown).toEqual(base.blockBreakdown);
  });
});
