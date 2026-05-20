import { describe, it, expect } from "vitest";
import { ALL_PROVIDERS, activeProviders } from "@/lib/providers";

describe("provider registry", () => {
  it("alle Provider haben Pflicht-Felder", () => {
    for (const p of ALL_PROVIDERS) {
      expect(p.name).toBeTruthy();
      expect(typeof p.available).toBe("function");
      expect(typeof p.fetch).toBe("function");
    }
  });

  it("ohne Keys: yahoo+edgar+rss aktiv, fmp+av nicht", () => {
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHA_VANTAGE_API_KEY;
    const names = activeProviders().map((p) => p.name);
    expect(names).toContain("yahoo");
    expect(names).toContain("edgar");
    expect(names).toContain("rss");
    expect(names).not.toContain("fmp");
    expect(names).not.toContain("alphavantage");
  });

  it("mit Keys: fmp+av kommen dazu", () => {
    process.env.FMP_API_KEY = "test";
    process.env.ALPHA_VANTAGE_API_KEY = "test";
    const names = activeProviders().map((p) => p.name);
    expect(names).toContain("fmp");
    expect(names).toContain("alphavantage");
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHA_VANTAGE_API_KEY;
  });
});
