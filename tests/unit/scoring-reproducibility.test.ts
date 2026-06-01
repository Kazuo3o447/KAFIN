import { describe, expect, it } from "vitest";
import { scoreCompany } from "@/lib/scoring/engine";
import { makeDataset } from "./dataset-fixture";

describe("scoring reproducibility", () => {
  it("is deterministic for quality archetype", () => {
    const dataset = makeDataset("quality");
    const first = scoreCompany(dataset, "quality_compounder");
    const second = scoreCompany(dataset, "quality_compounder");
    expect(second).toEqual(first);
  });

  it("is deterministic for emerging archetype", () => {
    const dataset = makeDataset("emerging");
    const first = scoreCompany(dataset, "emerging_winner");
    const second = scoreCompany(dataset, "emerging_winner");
    expect(second).toEqual(first);
  });

  it("is deterministic for cyclical archetype", () => {
    const dataset = makeDataset("cyclical");
    const first = scoreCompany(dataset, "quality_compounder");
    const second = scoreCompany(dataset, "quality_compounder");
    expect(second).toEqual(first);
  });
});
