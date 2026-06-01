import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { normalizeIsin } from "@/lib/providers/symbol-resolution";

const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "unit", "fixtures", name), "utf8"));

describe("symbol resolution", () => {
  it("accepts valid ISIN and rejects invalid checksum", () => {
    expect(normalizeIsin("US5949181045")).toBe("US5949181045");
    expect(normalizeIsin("US5949181046")).toBeNull();
  });

  it("loads all new adapter fixtures", () => {
    const finnhub = fixture("finnhub-estimates.json") as { data: unknown[] };
    const fred = fixture("fred-sample.json") as { hy: unknown[]; yc: unknown[]; vix: unknown[] };
    const insider = fixture("edgar-insider-sample.json") as { topTransactions: unknown[] };
    const thirteenF = fixture("edgar-13f-sample.json") as { filings: unknown };

    expect(finnhub.data.length).toBeGreaterThan(0);
    expect(fred.hy.length).toBeGreaterThan(0);
    expect(fred.yc.length).toBeGreaterThan(0);
    expect(fred.vix.length).toBeGreaterThan(0);
    expect(insider.topTransactions.length).toBeGreaterThan(0);
    expect(thirteenF.filings).toBeTruthy();
  });
});
