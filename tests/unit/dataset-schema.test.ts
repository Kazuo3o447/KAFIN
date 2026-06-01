import { describe, expect, it } from "vitest";
import { CompanyDatasetSchema, MarketContextSchema, tracked } from "@/lib/schemas/dataset";
import type { Provenance } from "@/lib/providers/types";

const prov: Provenance = {
  source: "test",
  url: "https://example.com",
  klass: "B",
  asOf: "2026-06-01",
  stale: false,
};

describe("dataset schema", () => {
  it("accepts a minimal valid dataset with nullables", () => {
    const parsed = CompanyDatasetSchema.parse({
      identity: {
        ticker: "MSFT",
        name: "Microsoft",
        isin: null,
        wkn: null,
        exchange: "NASDAQ",
        currency: "USD",
        country: "US",
        sector: null,
        industry: null,
        asOf: "2026-06-01",
      },
      annual: [
        {
          periodEnd: "2025-12-31",
          fiscalYear: 2025,
          fiscalQuarter: null,
          revenue: tracked(100, prov),
          grossProfit: tracked(60, prov),
          ebit: tracked(30, prov),
          ebitda: tracked(35, prov),
          netIncome: tracked(25, prov),
          operatingCashflow: tracked(28, prov),
          capex: tracked(5, prov),
          freeCashflow: tracked(23, prov),
          sharesDiluted: tracked(10, prov),
          dividendPerShare: tracked(null, prov),
          totalDebt: tracked(20, prov),
          cashAndEquivalents: tracked(40, prov),
          totalEquity: tracked(80, prov),
          totalAssets: tracked(150, prov),
          interestExpense: tracked(1, prov),
          researchAndDevelopment: tracked(10, prov),
          stockBasedComp: tracked(2, prov),
          inventory: tracked(3, prov),
          accountsReceivable: tracked(12, prov),
          shareRepurchases: tracked(4, prov),
        },
      ],
      quarterly: [],
      estimates: {
        revenueFwd: [],
        ebitFwd: [],
        epsFwd: [],
        revenueCagr3yFwd: null,
        ebitCagr3yFwd: null,
        guidanceTrend: null,
        provenance: [prov],
      },
      earningsHistory: [],
      prices: { currency: "USD", daily: [], provenance: [prov] },
      ownership: {
        institutionalPctHeld: null,
        institutionalQoqChangePp: null,
        institutionalTrend: null,
        insiderOwnershipPct: null,
        sharesOutstanding: null,
        floatShares: null,
        provenance: [prov],
      },
      insiderTransactions: [],
      shortInterest: {
        pctOfFloat: null,
        daysToCover: null,
        sharesShort: null,
        trend: null,
        provenance: [prov],
        asOf: "2026-05-15",
      },
      segments: [],
      saas: null,
      analyst: {
        count: null,
        recommendationMean: null,
        targetMean: null,
        targetHigh: null,
        targetLow: null,
        upgrades3m: null,
        downgrades3m: null,
        provenance: [prov],
      },
      coverage: {
        growth: { filled: 0, total: 1, ratio: 0, anyStale: false },
        profitability: { filled: 0, total: 1, ratio: 0, anyStale: false },
        risk: { filled: 0, total: 1, ratio: 0, anyStale: false },
        valuation: { filled: 0, total: 1, ratio: 0, anyStale: false },
        momentum_sentiment: { filled: 0, total: 1, ratio: 0, anyStale: false },
        ownership_smart_money: { filled: 0, total: 1, ratio: 0, anyStale: false },
        overallRatio: 0,
      },
    });

    expect(parsed.identity.ticker).toBe("MSFT");
  });

  it("rejects missing provenance URL", () => {
    expect(() =>
      CompanyDatasetSchema.parse({
        identity: {
          ticker: "MSFT",
          name: null,
          isin: null,
          wkn: null,
          exchange: null,
          currency: null,
          country: null,
          sector: null,
          industry: null,
          asOf: "2026-06-01",
        },
        annual: [],
        quarterly: [],
        estimates: {
          revenueFwd: [],
          ebitFwd: [],
          epsFwd: [],
          revenueCagr3yFwd: null,
          ebitCagr3yFwd: null,
          guidanceTrend: null,
          provenance: [{ ...prov, url: "" }],
        },
        earningsHistory: [],
        prices: { currency: null, daily: [], provenance: [prov] },
        ownership: {
          institutionalPctHeld: null,
          institutionalQoqChangePp: null,
          institutionalTrend: null,
          insiderOwnershipPct: null,
          sharesOutstanding: null,
          floatShares: null,
          provenance: [prov],
        },
        insiderTransactions: [],
        shortInterest: { pctOfFloat: null, daysToCover: null, sharesShort: null, trend: null, provenance: [prov], asOf: null },
        segments: [],
        saas: null,
        analyst: {
          count: null,
          recommendationMean: null,
          targetMean: null,
          targetHigh: null,
          targetLow: null,
          upgrades3m: null,
          downgrades3m: null,
          provenance: [prov],
        },
        coverage: {
          growth: { filled: 0, total: 1, ratio: 0, anyStale: false },
          profitability: { filled: 0, total: 1, ratio: 0, anyStale: false },
          risk: { filled: 0, total: 1, ratio: 0, anyStale: false },
          valuation: { filled: 0, total: 1, ratio: 0, anyStale: false },
          momentum_sentiment: { filled: 0, total: 1, ratio: 0, anyStale: false },
          ownership_smart_money: { filled: 0, total: 1, ratio: 0, anyStale: false },
          overallRatio: 0,
        },
      }),
    ).toThrow();
  });

  it("parses market context with regime null", () => {
    const parsed = MarketContextSchema.parse({
      asOf: "2026-06-01",
      indexVsMa200Pct: null,
      breadthPctAboveMa200: null,
      vix: 18,
      vixPercentile1y: 55,
      highYieldSpread: 4,
      yieldCurve10y2y: -0.2,
      regime: null,
      provenance: [prov],
    });
    expect(parsed.regime).toBeNull();
  });
});
