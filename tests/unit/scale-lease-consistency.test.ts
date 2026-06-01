import { describe, expect, it } from "vitest";
import { buildDebtBreakdown } from "@/lib/research/debt-breakdown";

describe("scale and lease consistency", () => {
  it("flags x1000-like scale mismatch suspicion", () => {
    const result = buildDebtBreakdown([
      { field: "total_debt", value: 12000000, url: "https://example.com", klass: "B", asOf: "2026-06-01" },
      { field: "term_debt", value: 12000, url: "https://example.com", klass: "B", asOf: "2026-06-01" },
      { field: "cash_and_equivalents", value: 1000, url: "https://example.com", klass: "B", asOf: "2026-06-01" },
    ]);

    expect(result.issues.some((i) => i.includes("scale mismatch suspicion"))).toBe(true);
    expect(result.confidence).toBe("low");
  });
});
