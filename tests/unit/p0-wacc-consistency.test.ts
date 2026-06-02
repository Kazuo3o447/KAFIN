/**
 * P0-Korrektheitstests: WACC und Net-Debt/EBITDA.
 *
 * Prüft:
 *  1. computeWACC produziert exakte bekannte Werte (CAPM + Debt-Blend).
 *  2. deriveMetricsFromDataset nutzt EBITDA (nicht EBIT) für netDebtToEbitda.
 *  3. deriveMetricsFromDataset WACC nutzt CAPM-Blend, nicht den alten flachen rf+erp.
 *  4. Konsistenztest: deriveKeyMetrics und deriveMetricsFromDataset liefern
 *     auf identischem Fixture denselben WACC und dieselbe Net-Debt/EBITDA.
 */
import { describe, expect, it } from "vitest";
import {
  computeWACC,
  deriveMetricsFromDataset,
  deriveKeyMetrics,
} from "@/lib/research/derived-metrics";
import { CompanyDatasetSchema, type FinancialPeriod } from "@/lib/schemas/dataset";
import { THRESHOLDS } from "@/lib/research/thresholds";
import type { ProviderFact } from "@/lib/providers/types";

// ---------------------------------------------------------------------------
// Gemeinsame Testkonstanten (bekannte Werte)
// ---------------------------------------------------------------------------
const TOTAL_DEBT = 200;
const CASH = 100;
const NET_DEBT = TOTAL_DEBT - CASH; // 100
const EBITDA_VAL = 50;
const EBIT_VAL = 40; // absichtlich von EBITDA verschieden, um Proxy-Fehler zu prüfen
const PRICE = 10;
const SHARES = 100;
const MARKET_CAP = PRICE * SHARES; // 1000
const EV = MARKET_CAP + NET_DEBT; // 1100

// Erwarteter WACC (beta=1.0):
//   costOfEquity = rf + 1.0 * erp = 0.045 + 0.055 = 0.10
//   debtWeight   = 100 / 1100
//   afterTaxCOD  = 0.05 * (1 − 0.21) = 0.0395
//   WACC         = (1 − 100/1100) * 0.10 + (100/1100) * 0.0395
const expectedDebtWeight = NET_DEBT / EV;
const expectedWACC =
  (1 - expectedDebtWeight) *
    (THRESHOLDS.wacc_risk_free_rate + 1.0 * THRESHOLDS.wacc_equity_risk_premium) +
  expectedDebtWeight * (THRESHOLDS.wacc_cost_of_debt * (1 - THRESHOLDS.wacc_tax_rate));

// Erwartete Net-Debt/EBITDA:
const expectedNetDebtToEbitda = NET_DEBT / EBITDA_VAL; // 2.0

// ---------------------------------------------------------------------------
// Fixture-Hilfsfunktionen
// ---------------------------------------------------------------------------
const prov = { source: "test", url: "https://test.example.com", klass: "B" as const, asOf: "2026-01-01", stale: false };
function tn(value: number | null): { value: number | null; provenance: typeof prov; kind: "actual" } {
  return { value, provenance: prov, kind: "actual" };
}

function fact(field: string, value: unknown): ProviderFact {
  return { field, value, url: "https://test.example.com", asOf: "2026-01-01", klass: "B" };
}

/** Erzeugt ein minimales FinancialPeriod-Objekt mit kontrollierten Schulden/EBITDA-Werten. */
function makeTestPeriod(year: number, revenue: number): FinancialPeriod {
  const isLatest = year === 2025;
  return {
    periodEnd: `${year}-12-31`,
    fiscalYear: year,
    fiscalQuarter: null,
    revenue: tn(revenue),
    grossProfit: tn(revenue * 0.6),
    ebit: tn(isLatest ? EBIT_VAL : revenue * 0.1),
    ebitda: tn(isLatest ? EBITDA_VAL : revenue * 0.13),
    netIncome: tn(revenue * 0.07),
    operatingCashflow: tn(revenue * 0.12),
    capex: tn(revenue * 0.04),
    freeCashflow: tn(revenue * 0.08),
    sharesDiluted: tn(SHARES),
    dividendPerShare: tn(0),
    totalDebt: tn(isLatest ? TOTAL_DEBT : revenue * 0.2),
    cashAndEquivalents: tn(isLatest ? CASH : revenue * 0.1),
    totalEquity: tn(revenue * 0.7),
    totalAssets: tn(revenue * 1.5),
    interestExpense: tn(revenue * 0.01),
    researchAndDevelopment: tn(revenue * 0.07),
    stockBasedComp: tn(revenue * 0.015),
    inventory: tn(revenue * 0.05),
    accountsReceivable: tn(revenue * 0.08),
    shareRepurchases: tn(-revenue * 0.01),
  };
}

/** Erstellt ein minimales CompanyDataset für die Scoring-Engine. */
function makeTestDataset() {
  const annual = [2021, 2022, 2023, 2024, 2025].map((y, i) =>
    makeTestPeriod(y, 100 * Math.pow(1.12, i)),
  );
  return CompanyDatasetSchema.parse({
    identity: {
      ticker: "TEST",
      name: "Test Co",
      isin: null,
      wkn: null,
      exchange: null,
      currency: "USD",
      country: "US",
      sector: "Technology",
      industry: "Software",
      asOf: "2026-01-01",
    },
    annual,
    quarterly: [],
    estimates: {
      revenueFwd: [],
      ebitFwd: [],
      epsFwd: [],
      revenueCagr3yFwd: null,
      ebitCagr3yFwd: null,
      guidanceTrend: null,
      provenance: [],
    },
    earningsHistory: [],
    prices: {
      currency: "USD",
      daily: [{ date: "2026-01-01", close: PRICE, volume: null }],
      provenance: [],
    },
    ownership: {
      institutionalPctHeld: null,
      institutionalQoqChangePp: null,
      institutionalTrend: null,
      insiderOwnershipPct: null,
      sharesOutstanding: SHARES,
      floatShares: null,
      provenance: [],
    },
    insiderTransactions: [],
    shortInterest: {
      pctOfFloat: null,
      daysToCover: null,
      sharesShort: null,
      trend: null,
      provenance: [],
      asOf: null,
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
      provenance: [],
    },
    coverage: {
      growth: { filled: 2, total: 4, ratio: 0.5, anyStale: false },
      profitability: { filled: 2, total: 4, ratio: 0.5, anyStale: false },
      risk: { filled: 2, total: 4, ratio: 0.5, anyStale: false },
      valuation: { filled: 2, total: 4, ratio: 0.5, anyStale: false },
      momentum_sentiment: { filled: 1, total: 4, ratio: 0.25, anyStale: false },
      ownership_smart_money: { filled: 1, total: 4, ratio: 0.25, anyStale: false },
      overallRatio: 0.45,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("P0 – computeWACC bekannte Werte", () => {
  it("berechnet CAPM+Debt-Blend korrekt (beta=1.0, debtWeight=netDebt/EV)", () => {
    const { wacc, fallbackBeta, debtWeight } = computeWACC(1.0, NET_DEBT, EV);

    expect(fallbackBeta).toBe(false);
    expect(debtWeight).toBeCloseTo(expectedDebtWeight, 8);
    expect(wacc).toBeCloseTo(expectedWACC, 8);
  });

  it("null-beta aktiviert Fallback=1.0 und liefert selben WACC wie beta=1.0", () => {
    const { wacc: wNull, fallbackBeta: fb } = computeWACC(null, NET_DEBT, EV);
    const { wacc: w1 } = computeWACC(1.0, NET_DEBT, EV);

    expect(fb).toBe(true);
    expect(wNull).toBeCloseTo(w1, 8);
  });

  it("fehlendes EV → debtWeight=0, WACC = reines CAPM-CoE", () => {
    const { wacc, debtWeight } = computeWACC(1.0, NET_DEBT, null);
    const pureCoe = THRESHOLDS.wacc_risk_free_rate + 1.0 * THRESHOLDS.wacc_equity_risk_premium;

    expect(debtWeight).toBe(0);
    expect(wacc).toBeCloseTo(pureCoe, 8);
  });

  it("CAPM-WACC ist strikt kleiner als reines CoE wenn debtWeight > 0 und CoD < CoE", () => {
    const { wacc } = computeWACC(1.0, NET_DEBT, EV);
    const pureCoe = THRESHOLDS.wacc_risk_free_rate + 1.0 * THRESHOLDS.wacc_equity_risk_premium;
    // After-tax CoD ist typischerweise unter CoE → WACC < CoE
    const afterTaxCod = THRESHOLDS.wacc_cost_of_debt * (1 - THRESHOLDS.wacc_tax_rate);
    if (afterTaxCod < pureCoe) {
      expect(wacc).toBeLessThan(pureCoe);
    }
  });
});

describe("P0 – deriveMetricsFromDataset: WACC und Net-Debt/EBITDA", () => {
  const dataset = makeTestDataset();
  const m = deriveMetricsFromDataset(dataset);

  it("netDebtToEbitda nutzt EBITDA (nicht EBIT) – korrekt 100/50 = 2.0", () => {
    // EBIT=40, EBITDA=50, netDebt=100
    // Falscher Wert wäre 100/40 = 2.5; korrekter Wert ist 100/50 = 2.0
    expect(m.netDebtToEbitda).toBeCloseTo(expectedNetDebtToEbitda, 4);
    expect(m.netDebtToEbitda).not.toBeCloseTo(NET_DEBT / EBIT_VAL, 4); // nicht EBIT-Proxy
  });

  it("WACC entspricht dem CAPM+Debt-Blend (nicht dem flachen rf+erp)", () => {
    const flatFallback = THRESHOLDS.wacc_risk_free_rate + THRESHOLDS.wacc_equity_risk_premium;
    // Alter Fehler: wacc === flatFallback (= 0.10) — dieser Test soll genau das verhindern.
    // Sobald EV > 0 und netDebt > 0 gilt CAPM-Blend ≠ flat, da debtWeight > 0 und
    // afterTaxCoD < CoE → WACC < flat rf+erp (leicht).
    const afterTaxCod = THRESHOLDS.wacc_cost_of_debt * (1 - THRESHOLDS.wacc_tax_rate);
    if (afterTaxCod < flatFallback && m.wacc !== null) {
      expect(m.wacc).toBeLessThan(flatFallback);
    }
    expect(m.wacc).toBeCloseTo(expectedWACC, 4);
  });

  it("roicWaccSpread = roic - wacc (CAPM-WACC)", () => {
    if (m.roic !== null && m.wacc !== null && m.roicWaccSpread !== null) {
      expect(m.roicWaccSpread).toBeCloseTo(m.roic - m.wacc, 6);
    }
  });
});

describe("P0 – Konsistenztest: deriveKeyMetrics ≈ deriveMetricsFromDataset", () => {
  it("WACC ist gleich wenn beta=1.0 und identische Kapitalstruktur+EV", () => {
    const dataset = makeTestDataset();
    const scored = deriveMetricsFromDataset(dataset);

    // Für deriveKeyMetrics: beta=1.0 explizit, gleicher netDebt und EV via enterprise_value-Fact
    const facts: ProviderFact[] = [
      fact("beta", 1.0),
      fact("total_debt", TOTAL_DEBT),
      fact("total_cash", CASH),
      fact("ebitda", EBITDA_VAL),
      fact("enterprise_value", EV),
    ];
    const displayed = deriveKeyMetrics("TEST", "2026-01-01", facts);

    const waccScored = scored.wacc;
    const waccDisplayed = displayed.metrics.wacc;

    expect(waccScored).not.toBeNull();
    expect(waccDisplayed).not.toBeNull();
    if (waccScored !== null && waccDisplayed !== null) {
      // Toleranz 0.001 (0.1 Prozentpunkte) — beide Pfade nutzen computeWACC mit selber Formel
      expect(Math.abs(waccScored - waccDisplayed)).toBeLessThan(0.001);
    }
  });

  it("net_debt_to_ebitda ist gleich in beiden Pfaden", () => {
    const dataset = makeTestDataset();
    const scored = deriveMetricsFromDataset(dataset);

    const facts: ProviderFact[] = [
      fact("total_debt", TOTAL_DEBT),
      fact("total_cash", CASH),
      fact("ebitda", EBITDA_VAL),
    ];
    const displayed = deriveKeyMetrics("TEST", "2026-01-01", facts);

    const ndEbitdaScored = scored.netDebtToEbitda;
    const ndEbitdaDisplayed = displayed.metrics.net_debt_to_ebitda;

    expect(ndEbitdaScored).not.toBeNull();
    expect(ndEbitdaDisplayed).not.toBeNull();
    if (ndEbitdaScored !== null && ndEbitdaDisplayed !== null) {
      expect(Math.abs(ndEbitdaScored - ndEbitdaDisplayed)).toBeLessThan(0.001);
    }
  });
});
