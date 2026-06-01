import { describe, expect, it } from "vitest";
import { INDICATOR_FUNCTIONS } from "@/lib/scoring/rubric-fn";
import { THRESHOLDS } from "@/lib/research/thresholds";
import { deriveMetricsFromDataset } from "@/lib/research/derived-metrics";
import { makeDataset } from "./dataset-fixture";

describe("rubric functions", () => {
  it("scores revenue growth quality with valid input", () => {
    const dataset = makeDataset("quality");
    const m = deriveMetricsFromDataset(dataset);
    const out = INDICATOR_FUNCTIONS.revenue_growth_quality(m, dataset, THRESHOLDS);

    expect(out.score).not.toBeNull();
    expect(out.reason.length).toBeGreaterThan(0);
    expect(out.inputs).toContain("revenueCagr3y");
  });

  it("returns null score when required input is missing", () => {
    const dataset = makeDataset("quality");
    const m = deriveMetricsFromDataset(dataset);
    m.revenueCagr3y = null;

    const out = INDICATOR_FUNCTIONS.revenue_growth_quality(m, dataset, THRESHOLDS);
    expect(out.score).toBeNull();
    expect(out.reason).toMatch(/fehlt/i);
  });
});
