import { describe, expect, it } from "vitest";
import { detectProviderConflicts } from "@/lib/research/conflict-detector";

describe("provider conflict resolution", () => {
  it("selects deterministic winner by provider precedence", () => {
    const conflicts = detectProviderConflicts([
      { field: "ev_sales", value: 9.5, url: "https://query1.finance.yahoo.com/test", klass: "B", asOf: "2026-06-01" },
      { field: "ev_sales", value: 6.2, url: "https://www.sec.gov/test", klass: "A-", asOf: "2026-06-01" },
    ]);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0]?.winner.provider.includes("sec.gov")).toBe(true);
    expect(conflicts[0]?.winner.value).toBe(6.2);
  });
});
