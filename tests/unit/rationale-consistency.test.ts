import { describe, expect, it } from "vitest";
import { KeyMetricsSchema } from "@/lib/schemas/report";
import { findRationaleConsistencyIssues } from "@/lib/research/rationale-consistency";

describe("rationale consistency guard", () => {
  it("flags high beta claim when beta is low", () => {
    const km = KeyMetricsSchema.parse({ beta: 1.0 });
    const issues = findRationaleConsistencyIssues("High beta drives fragility", km);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.issue).toContain("beta=1");
  });

  it("flags ROIC > WACC claim when data is missing", () => {
    const km = KeyMetricsSchema.parse({ roic: null, roic_wacc_spread: null });
    const issues = findRationaleConsistencyIssues("ROIC > WACC supports moat", km);
    expect(issues.some((x) => x.id === "roic_wacc_requires_roic")).toBe(true);
  });
});
