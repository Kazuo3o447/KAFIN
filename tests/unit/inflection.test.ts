import { describe, expect, it } from "vitest";
import { computeInflectionFlags } from "@/lib/research/inflection";
import { makeDataset } from "./dataset-fixture";

describe("inflection flags", () => {
  it("detects operating and fcf turn positive", () => {
    const dataset = makeDataset("emerging");
    const q = dataset.quarterly;
    q[q.length - 2]!.ebit.value = -1;
    q[q.length - 1]!.ebit.value = 2;
    q[q.length - 2]!.freeCashflow.value = -1;
    q[q.length - 1]!.freeCashflow.value = 2;

    const flags = computeInflectionFlags(dataset, 3, 0.5);
    expect(flags.operatingMarginTurnedPositive).toBe(true);
    expect(flags.fcfTurnedPositive).toBe(true);
    expect(flags.revisionMomentumPositive).toBe(true);
  });
});
