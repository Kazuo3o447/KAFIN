import { describe, expect, it } from "vitest";
import { buildDebtBreakdown } from "@/lib/research/debt-breakdown";
import type { ProviderFact } from "@/lib/providers/types";

function fact(field: string, value: unknown): ProviderFact {
  return {
    field,
    value,
    url: "https://example.com",
    title: field,
    asOf: "2026-05-23",
    klass: "B",
  };
}

describe("debt breakdown", () => {
  it("keeps confidence low when only provider total debt is available", () => {
    const result = buildDebtBreakdown([
      fact("total_debt", 4000),
      fact("cash_and_equivalents", 1000),
    ]);

    expect(result.confidence).toBe("low");
    expect(result.interest_bearing_debt).toBeNull();
    expect(result.issues[0]).toContain("component reconciliation");
  });

  it("excludes operating leases from interest-bearing debt", () => {
    const result = buildDebtBreakdown([
      fact("total_debt", 900),
      fact("short_term_debt", 100),
      fact("long_term_debt", 500),
      fact("convertible_notes_principal", 100),
      fact("finance_lease_liabilities", 80),
      fact("operating_lease_liabilities", 120),
      fact("cash_and_equivalents", 200),
    ]);

    expect(result.interest_bearing_debt).toBe(780);
    expect(result.net_debt_interest_bearing).toBe(580);
    expect(result.provider_total_debt).toBe(900);
    expect(result.operating_lease_liabilities).toBe(120);
  });
});
