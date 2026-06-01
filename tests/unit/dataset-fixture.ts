import { CompanyDatasetSchema, type CompanyDataset, type FinancialPeriod } from "@/lib/schemas/dataset";

const provenance = {
  source: "test",
  url: "https://example.com/test",
  klass: "B" as const,
  asOf: "2025-01-01",
  stale: false,
};

function tn(value: number | null) {
  return { value, provenance };
}

function makePeriod(date: string, revenue: number, gm: number, om: number, fcfm: number, shares: number): FinancialPeriod {
  const grossProfit = revenue * gm;
  const ebit = revenue * om;
  const ebitda = ebit + revenue * 0.03;
  const capex = revenue * 0.04;
  const freeCashflow = revenue * fcfm;
  const operatingCashflow = freeCashflow + capex;
  const netIncome = revenue * Math.max(om - 0.03, -0.05);
  return {
    periodEnd: date,
    fiscalYear: Number(date.slice(0, 4)),
    fiscalQuarter: null,
    revenue: tn(revenue),
    grossProfit: tn(grossProfit),
    ebit: tn(ebit),
    ebitda: tn(ebitda),
    netIncome: tn(netIncome),
    operatingCashflow: tn(operatingCashflow),
    capex: tn(capex),
    freeCashflow: tn(freeCashflow),
    sharesDiluted: tn(shares),
    dividendPerShare: tn(0),
    totalDebt: tn(revenue * 0.3),
    cashAndEquivalents: tn(revenue * 0.15),
    totalEquity: tn(revenue * 0.7),
    totalAssets: tn(revenue * 1.8),
    interestExpense: tn(revenue * 0.01),
    researchAndDevelopment: tn(revenue * 0.07),
    stockBasedComp: tn(revenue * 0.015),
    inventory: tn(revenue * 0.05),
    accountsReceivable: tn(revenue * 0.08),
    shareRepurchases: tn(-revenue * 0.01),
  };
}

export function makeDataset(archetype: "quality" | "emerging" | "cyclical"): CompanyDataset {
  const years = Array.from({ length: 11 }, (_, i) => 2015 + i);
  const annual = years.map((y, idx) => {
    const growth = archetype === "emerging" ? 1.22 : archetype === "cyclical" ? (idx % 2 === 0 ? 1.18 : 0.92) : 1.12;
    const base = 100 * Math.pow(growth, idx);
    const gm = archetype === "emerging" ? 0.48 : archetype === "cyclical" ? (idx % 2 === 0 ? 0.46 : 0.31) : 0.62;
    const om = archetype === "emerging" ? (idx < 7 ? -0.02 + idx * 0.01 : 0.07) : archetype === "cyclical" ? (idx % 2 === 0 ? 0.17 : 0.03) : 0.22;
    const fcf = archetype === "emerging" ? (idx < 7 ? -0.01 + idx * 0.008 : 0.08) : archetype === "cyclical" ? (idx % 2 === 0 ? 0.12 : 0.01) : 0.16;
    const shares = archetype === "emerging" ? 100 * Math.pow(1.03, idx) : 100 * Math.pow(1.01, idx);
    return makePeriod(`${y}-12-31`, base, gm, om, fcf, shares);
  });

  const quarterly = Array.from({ length: 8 }, (_, i) => {
    const y = 2023 + Math.floor(i / 4);
    const q = (i % 4) + 1;
    const growth = archetype === "emerging" ? 1.08 : archetype === "cyclical" ? (i % 2 === 0 ? 1.08 : 0.95) : 1.04;
    const rev = 40 * Math.pow(growth, i);
    const gm = archetype === "emerging" ? 0.5 : archetype === "cyclical" ? (i % 2 === 0 ? 0.44 : 0.3) : 0.63;
    const om = archetype === "emerging" ? (i < 4 ? -0.03 + i * 0.01 : 0.04) : archetype === "cyclical" ? (i % 2 === 0 ? 0.15 : 0.01) : 0.23;
    const fcf = archetype === "emerging" ? (i < 4 ? -0.02 + i * 0.01 : 0.07) : archetype === "cyclical" ? (i % 2 === 0 ? 0.1 : 0.0) : 0.16;
    return {
      ...makePeriod(`${y}-${String(q * 3).padStart(2, "0")}-30`, rev, gm, om, fcf, 110),
      fiscalQuarter: q,
    };
  });

  const dataset = {
    identity: {
      ticker: "TEST",
      name: "Test Corp",
      isin: "US0000000001",
      wkn: null,
      exchange: "NASDAQ",
      currency: "USD",
      country: "US",
      sector: "Technology",
      industry: "Software",
      asOf: "2025-01-01",
    },
    annual,
    quarterly,
    estimates: {
      revenueFwd: [{ year: 2026, value: 450 }],
      ebitFwd: [{ year: 2026, value: archetype === "emerging" ? 35 : 80 }],
      epsFwd: [{ year: 2026, value: 2.2 }],
      revenueCagr3yFwd: archetype === "emerging" ? 0.2 : 0.1,
      ebitCagr3yFwd: archetype === "emerging" ? 0.25 : 0.08,
      guidanceTrend: "raised",
      provenance: [provenance],
    },
    earningsHistory: [
      { date: "2024-03-31", epsActual: 1.0, epsEstimate: 0.9, surprisePct: 0.11, revenueActual: 50, revenueEstimate: 48, revenueSurprisePct: 0.04 },
      { date: "2024-06-30", epsActual: 1.1, epsEstimate: 1.0, surprisePct: 0.1, revenueActual: 52, revenueEstimate: 50, revenueSurprisePct: 0.04 },
      { date: "2024-09-30", epsActual: 1.2, epsEstimate: 1.1, surprisePct: 0.09, revenueActual: 55, revenueEstimate: 53, revenueSurprisePct: 0.04 },
      { date: "2024-12-31", epsActual: 1.3, epsEstimate: 1.15, surprisePct: 0.13, revenueActual: 58, revenueEstimate: 56, revenueSurprisePct: 0.04 },
    ],
    prices: {
      currency: "USD",
      daily: [
        { date: "2024-12-30", close: 95, volume: 1000000 },
        { date: "2024-12-31", close: 100, volume: 1200000 },
      ],
      provenance: [provenance],
    },
    ownership: {
      institutionalPctHeld: 0.67,
      institutionalQoqChangePp: 0.02,
      institutionalTrend: "accumulating",
      insiderOwnershipPct: 0.04,
      sharesOutstanding: 120,
      floatShares: 100,
      provenance: [provenance],
    },
    insiderTransactions: [
      { date: "2024-12-10", insiderName: "A", role: "CEO", type: "buy", valueUsd: 400000, shares: 5000, isOpenMarket: true, provenance: [provenance] },
      { date: "2024-12-20", insiderName: "B", role: "CFO", type: "buy", valueUsd: 300000, shares: 3500, isOpenMarket: true, provenance: [provenance] },
    ],
    shortInterest: {
      pctOfFloat: archetype === "emerging" ? 0.14 : 0.06,
      daysToCover: 5,
      sharesShort: 14,
      trend: "rising",
      provenance: [provenance],
      asOf: "2024-12-31",
    },
    segments: [],
    saas: {
      netRevenueRetention: 1.12,
      remainingPerformanceObligations: 200,
      deferredRevenue: 120,
      arr: 500,
      provenance: [provenance],
    },
    analyst: {
      count: 18,
      recommendationMean: 2.0,
      targetMean: 120,
      targetHigh: 140,
      targetLow: 90,
      upgrades3m: 6,
      downgrades3m: 2,
      provenance: [provenance],
    },
    coverage: {
      growth: { filled: 8, total: 10, ratio: 0.8, anyStale: false },
      profitability: { filled: 8, total: 10, ratio: 0.8, anyStale: false },
      risk: { filled: 8, total: 10, ratio: 0.8, anyStale: false },
      valuation: { filled: 8, total: 10, ratio: 0.8, anyStale: false },
      momentum_sentiment: { filled: 8, total: 10, ratio: 0.8, anyStale: false },
      ownership_smart_money: { filled: 8, total: 10, ratio: 0.8, anyStale: false },
      overallRatio: 0.8,
    },
  };

  return CompanyDatasetSchema.parse(dataset);
}
