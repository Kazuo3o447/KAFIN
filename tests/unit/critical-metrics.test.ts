import { describe, expect, it } from "vitest";
import { evaluateCriticalCoverage } from "@/lib/scoring/critical-metrics";

describe("critical metrics coverage", () => {
  it("flags missing critical metrics for quality lens", () => {
    const result = evaluateCriticalCoverage(
      {
        ev_sales: 8,
      },
      "quality_compounder",
    );

    expect(result.missing).toContain("roic");
    expect(result.missing).toContain("altman_z");
    expect(result.coverage).toBeLessThan(1);
  });
});
