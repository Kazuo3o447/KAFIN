import type { ProviderFact } from "@/lib/providers/types";
import { KeyMetricsSchema, type KeyMetrics } from "@/lib/schemas/report";
import {
  computePiotroskiF,
  computeMohanramG,
  computeAltmanZ,
  computeBeneishM,
} from "./forensics";
import { THRESHOLDS } from "./thresholds";
import { computeReverseDCF, type ReverseDCFResult } from "./reverse-dcf";
import type { CompanyDataset, FinancialPeriod } from "@/lib/schemas/dataset";

export interface DerivedMetricsResult {
  metrics: Partial<KeyMetrics>;
  facts: ProviderFact[];
  /** Forensic score detail objects — stored separately for report schema */
  forensics?: {
    piotroski: ReturnType<typeof computePiotroskiF>;
    mohanram: ReturnType<typeof computeMohanramG>;
    altman: ReturnType<typeof computeAltmanZ>;
    beneish: ReturnType<typeof computeBeneishM>;
  };
  reverseDcf?: ReverseDCFResult;
}

export interface DerivedMetrics {
  revenueCagr3y: number | null;
  revenueCagr5y: number | null;
  revenueCagr10y: number | null;
  ebitCagr3y: number | null;
  ebitCagr10y: number | null;
  fcfCagr5y: number | null;
  revenueAcceleration: number | null;
  revenueCagr3yFwd: number | null;
  ebitCagr3yFwd: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  fcfMargin: number | null;
  grossMarginTrend: number | null;
  operatingMarginTrend: number | null;
  fcfMarginTrend: number | null;
  grossMarginStddev: number | null;
  operatingMarginStddev: number | null;
  fcfMarginStddev: number | null;
  roic: number | null;
  roce: number | null;
  roe: number | null;
  wacc: number | null;
  roicWaccSpread: number | null;
  roicAdj: number | null;       // ROIC mit kapitalisiertem F&E (Mauboussin)
  roicFadeRate: number | null;  // Jährliche ROIC-Änderung über die Historienserie
  roiic: number | null;
  cashConversion: number | null;
  rAndDIntensity: number | null;
  capexIntensity: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  equityRatio: number | null;
  cashRunwayMonths: number | null;
  accrualsRatio: number | null;
  dilutionOverhang: number | null;
  evSales: number | null;
  evGrossProfit: number | null;
  pe: number | null;
  /** Forward PEG = NTM P/E ÷ fwd EPS-Wachstum. Null wenn kein positiver Gewinn. */
  peg: number | null;
  /** PEG Fallback Level 2: EV/EBIT ÷ EBIT-CAGR-fwd */
  evEbitToGrowth: number | null;
  /** PEG Fallback Level 4: PSG = EV/Sales ÷ Rev-CAGR-fwd */
  evSalesToGrowth: number | null;
  /** Welche PEG-Leiter-Stufe verwendet wurde (1–4); null wenn keine anwendbar */
  pegFallbackLevel: 1 | 2 | 3 | 4 | null;
  pfcf: number | null;
  fcfYield: number | null;
  dividendYield: number | null;
  evEbit: number | null;
  valuationZ: {
    evSales: number | null;
    evGrossProfit: number | null;
    pe: number | null;
    pfcf: number | null;
  };
  sue: number | null;
  beatStreak: number | null;
  revisionsBalance: number | null;
  upsideToTargetPct: number | null;
  guidanceTrend: "raised" | "maintained" | "lowered" | null;
  institutionalTrend: "accumulating" | "distributing" | "flat" | null;
  /** Short Interest % of Float (vom ShortInterest-Dataset) */
  shortInterestPctFloat: number | null;
  /** Days to cover / Short Ratio */
  daysToCover: number | null;
}

type MetricKey = keyof KeyMetrics;

const DERIVED_KEYS: MetricKey[] = [
  "revenue_growth_yoy",
  "revenue_cagr_3y",
  "gross_margin",
  "operating_margin",
  "fcf_margin",
  "roic",
  "rule_of_40",
  "rule_of_x",
  "share_count_growth_yoy",
  "sbc_to_revenue",
  "net_debt_to_ebitda",
  "beta",
  "ntm_pe",
  "ev_sales",
  "ev_gross_profit",
  "peg",
  // Phase A additions
  "piotroski_f",
  "mohanram_g",
  "altman_z",
  "beneish_m",
  "cash_runway_months",
  "wacc",
  "roic_wacc_spread",
  "gross_margin_trend",
  "operating_margin_trend",
  "fcf_margin_trend",
  "gross_margin_stddev",
  "operating_margin_stddev",
  "fcf_margin_stddev",
  // PEG Fallback Leiter
  "ev_ebit_to_growth",
  "ev_sales_to_growth",
  "peg_fallback_level",
  // Short Interest
  "short_interest_pct_float",
  "days_to_cover",
];

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null) {
    const rec = value as Record<string, unknown>;
    for (const key of ["value", "val", "raw", "fmt"]) {
      const n = toNumber(rec[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

function metricRound(value: number): number {
  if (Math.abs(value) >= 100) return Number(value.toFixed(2));
  if (Math.abs(value) >= 10) return Number(value.toFixed(3));
  return Number(value.toFixed(6));
}

function normalizeRatio(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) > 2 ? metricRound(value / 100) : metricRound(value);
}

function asPctPoints(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) <= 2 ? value * 100 : value;
}

function latestFact(facts: ProviderFact[], field: string): ProviderFact | undefined {
  return facts
    .filter((f) => f.field === field)
    .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
}

function latestNumber(facts: ProviderFact[], field: string): number | null {
  return toNumber(latestFact(facts, field)?.value);
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
  }
  if (typeof value !== "object" || value === null) return [];
  const rec = value as Record<string, unknown>;
  for (const key of ["annualReports", "quarterlyReports", "data"]) {
    const arr = rec[key];
    if (Array.isArray(arr)) {
      return arr.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
    }
  }
  return [];
}

function readNumberCaseInsensitive(record: Record<string, unknown>, keys: string[]): number | null {
  const lookup = new Map(Object.keys(record).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lookup.get(key.toLowerCase());
    if (!actual) continue;
    const n = toNumber(record[actual]);
    if (n !== null) return n;
  }
  return null;
}

function readDate(record: Record<string, unknown>): string {
  for (const key of ["date", "fiscalDateEnding", "calendarYear", "end"]) {
    const v = record[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

function seriesFromDataset(
  facts: ProviderFact[],
  fieldIncludes: string[],
  valueKeys: string[],
): Array<{ date: string; value: number }> {
  const rows: Array<{ date: string; value: number }> = [];
  for (const fact of facts) {
    const field = fact.field.toLowerCase();
    if (!fieldIncludes.some((needle) => field.includes(needle))) continue;
    for (const row of asRecordArray(fact.value)) {
      const value = readNumberCaseInsensitive(row, valueKeys);
      const date = readDate(row);
      if (value === null || value <= 0 || !date) continue;
      rows.push({ date, value });
    }
  }
  const deduped = new Map<string, number>();
  for (const row of rows) {
    if (!deduped.has(row.date)) deduped.set(row.date, row.value);
  }
  return Array.from(deduped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function cagrFromSeries(series: Array<{ date: string; value: number }>, periods: number): number | null {
  if (series.length <= periods) return null;
  const newest = series[0];
  const oldest = series[periods];
  if (!newest || !oldest || newest.value <= 0 || oldest.value <= 0) return null;
  return metricRound(Math.pow(newest.value / oldest.value, 1 / periods) - 1);
}

function yoyGrowthFromSeries(series: Array<{ date: string; value: number }>): number | null {
  const newest = series[0];
  const previous = series[1];
  if (!newest || !previous || previous.value <= 0) return null;
  return metricRound(newest.value / previous.value - 1);
}

function firstDatasetNumber(facts: ProviderFact[], fieldIncludes: string[], keys: string[]): number | null {
  for (const fact of facts) {
    const field = fact.field.toLowerCase();
    if (!fieldIncludes.some((needle) => field.includes(needle))) continue;
    const rows = asRecordArray(fact.value);
    if (rows.length === 0 && typeof fact.value === "object" && fact.value !== null) {
      const n = readNumberCaseInsensitive(fact.value as Record<string, unknown>, keys);
      if (n !== null) return n;
    }
    for (const row of rows) {
      const n = readNumberCaseInsensitive(row, keys);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Berechnet WACC via CAPM-Cost-of-Equity + after-tax-Cost-of-Debt gewichtet
 * nach Netto-Schuldenanteil am Enterprise Value.
 * Beide Ableitungspfade (deriveKeyMetrics und deriveMetricsFromDataset) nutzen
 * diese Funktion — damit sind angezeigte und gescorte WACC-Werte konsistent.
 *
 * @param beta    Equity-Beta; null → Fallback 1.0 (dokumentiert, kein stiller rf+erp)
 * @param netDebt Nettoverschuldung; null oder ≤0 → debtWeight = 0
 * @param ev      Enterprise Value; null oder ≤0 → debtWeight = 0
 */
export function computeWACC(
  beta: number | null,
  netDebt: number | null,
  ev: number | null,
): { wacc: number; fallbackBeta: boolean; debtWeight: number } {
  const fallbackBeta = beta === null;
  const effectiveBeta = fallbackBeta ? 1.0 : beta;
  const rf = THRESHOLDS.wacc_risk_free_rate;
  const erp = THRESHOLDS.wacc_equity_risk_premium;
  const costOfEquity = rf + effectiveBeta * erp;
  const debtWeight =
    ev !== null && ev > 0 && netDebt !== null && netDebt > 0 ? netDebt / ev : 0;
  const equityWeight = 1 - debtWeight;
  const afterTaxCostOfDebt = THRESHOLDS.wacc_cost_of_debt * (1 - THRESHOLDS.wacc_tax_rate);
  const wacc = equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;
  return { wacc, fallbackBeta, debtWeight };
}

export function deriveKeyMetrics(ticker: string, runDate: string, facts: ProviderFact[]): DerivedMetricsResult {
  const metrics: Partial<KeyMetrics> = {};
  const derivedFacts: ProviderFact[] = [];
  const derivedUrl = `derived:kafin:${ticker.toUpperCase()}:${runDate}:key-metrics`;

  const add = (key: MetricKey, value: number | null, formula: string, inputs: Record<string, unknown> = {}) => {
    if (value === null || !Number.isFinite(value)) return;
    const rounded = metricRound(value);
    metrics[key] = rounded;
    derivedFacts.push({
      field: `derived_${key}`,
      value: { value: rounded, formula, inputs },
      url: derivedUrl,
      title: "Kafin deterministic key metrics",
      asOf: runDate,
      klass: "B",
    });
  };

  const revenueGrowth = normalizeRatio(latestNumber(facts, "revenue_growth_yoy"));
  add("revenue_growth_yoy", revenueGrowth, "provider value normalized to decimal ratio");

  const grossMargin = normalizeRatio(latestNumber(facts, "gross_margin"));
  add("gross_margin", grossMargin, "provider value normalized to decimal ratio");

  const operatingMargin = normalizeRatio(latestNumber(facts, "operating_margin"));
  add("operating_margin", operatingMargin, "provider value normalized to decimal ratio");

  const beta = latestNumber(facts, "beta");
  add("beta", beta, "provider value");

  const ntmPe = latestNumber(facts, "forward_pe");
  add("ntm_pe", ntmPe, "provider forward P/E");

  const evSales = latestNumber(facts, "ev_to_revenue") ?? firstDatasetNumber(facts, ["key_metrics_ttm"], ["evToSalesTTM"]);
  add("ev_sales", evSales, "provider EV/Sales");

  const peg = latestNumber(facts, "peg_ratio") ?? firstDatasetNumber(facts, ["ratios_ttm"], ["priceEarningsToGrowthRatioTTM"]);
  add("peg", peg, "provider PEG");

  const revenueTtm =
    latestNumber(facts, "revenue_ttm") ??
    toNumber(latestFact(facts, "xbrl_Revenues")?.value) ??
    toNumber(latestFact(facts, "xbrl_RevenueFromContractWithCustomerExcludingAssessedTax")?.value);
  const freeCashflow =
    latestNumber(facts, "free_cashflow") ??
    firstDatasetNumber(facts, ["cashflow"], ["freeCashFlow", "freeCashflow"]);
  const fcfMargin = revenueTtm && freeCashflow !== null ? freeCashflow / revenueTtm : null;
  add("fcf_margin", fcfMargin, "free_cashflow / revenue_ttm", { freeCashflow, revenueTtm });

  const ebitda = latestNumber(facts, "ebitda");
  const totalCash = latestNumber(facts, "total_cash");
  const totalDebt = latestNumber(facts, "total_debt");
  const netDebtToEbitda =
    ebitda && ebitda > 0 && totalDebt !== null && totalCash !== null ? (totalDebt - totalCash) / ebitda : null;
  add("net_debt_to_ebitda", netDebtToEbitda, "(total_debt - total_cash) / ebitda", {
    totalDebt,
    totalCash,
    ebitda,
  });

  const enterpriseValue = latestNumber(facts, "enterprise_value");
  const grossProfit = revenueTtm && grossMargin !== null ? revenueTtm * grossMargin : null;
  const evGrossProfit = enterpriseValue && grossProfit && grossProfit > 0 ? enterpriseValue / grossProfit : null;
  add("ev_gross_profit", evGrossProfit, "enterprise_value / (revenue_ttm * gross_margin)", {
    enterpriseValue,
    revenueTtm,
    grossMargin,
  });

  const revenueSeries = seriesFromDataset(
    facts,
    ["income_statement", "income-statement", "av_income_statement"],
    ["revenue", "totalRevenue"],
  );
  const revenueCagr3y = cagrFromSeries(revenueSeries, 3);
  add("revenue_cagr_3y", revenueCagr3y, "3-year revenue CAGR from annual revenue series", {
    newest: revenueSeries[0],
    oldest: revenueSeries[3],
  });

  const shareSeries = seriesFromDataset(
    facts,
    ["income_statement", "balance_sheet", "av_balance_sheet"],
    ["weightedAverageShsOutDil", "weightedAverageShsOut", "commonStockSharesOutstanding", "sharesOutstanding"],
  );
  const shareCountGrowth = yoyGrowthFromSeries(shareSeries);
  add("share_count_growth_yoy", shareCountGrowth, "latest diluted share count / prior-year diluted share count - 1", {
    newest: shareSeries[0],
    previous: shareSeries[1],
  });

  const sbc =
    toNumber(latestFact(facts, "xbrl_ShareBasedCompensation")?.value) ??
    firstDatasetNumber(facts, ["cashflow"], ["stockBasedCompensation", "shareBasedCompensation"]);
  const sbcToRevenue = revenueTtm && sbc !== null ? sbc / revenueTtm : null;
  add("sbc_to_revenue", sbcToRevenue, "share-based compensation / revenue", { sbc, revenueTtm });

  const roic = normalizeRatio(
    firstDatasetNumber(facts, ["ratios_ttm", "key_metrics_ttm"], [
      "returnOnInvestedCapitalTTM",
      "roicTTM",
      "returnOnCapitalEmployedTTM",
      "returnOnInvestedCapital",
    ]),
  );
  add("roic", roic, "provider ROIC metric normalized to decimal ratio");

  const growthPts = asPctPoints(metrics.revenue_growth_yoy ?? null);
  const fcfPts = asPctPoints(metrics.fcf_margin ?? null);
  const ruleOf40 = growthPts !== null && fcfPts !== null ? growthPts + fcfPts : null;
  add("rule_of_40", ruleOf40, "revenue_growth_yoy percentage points + fcf_margin percentage points", {
    revenueGrowth: metrics.revenue_growth_yoy,
    fcfMargin: metrics.fcf_margin,
  });

  const ruleOfX = growthPts !== null && fcfPts !== null ? growthPts * 2 + fcfPts : null;
  add("rule_of_x", ruleOfX, "2 * revenue_growth_yoy percentage points + fcf_margin percentage points", {
    revenueGrowth: metrics.revenue_growth_yoy,
    fcfMargin: metrics.fcf_margin,
  });

  // -----------------------------------------------------------------------
  // Phase A: Forensic scores
  // -----------------------------------------------------------------------
  const piotroski = computePiotroskiF(facts);
  if (piotroski.score !== null) add("piotroski_f", piotroski.score, "Piotroski F-Score (0..9)");

  const mohanram = computeMohanramG(facts);
  if (mohanram.score !== null) add("mohanram_g", mohanram.score, "Mohanram G-Score (0..8)");

  const altman = computeAltmanZ(facts);
  if (altman.score !== null) add("altman_z", altman.score, "Altman Z-Score");

  const beneish = computeBeneishM(facts);
  if (beneish.score !== null) add("beneish_m", beneish.score, "Beneish M-Score");

  // -----------------------------------------------------------------------
  // Phase A: Cash Runway
  // -----------------------------------------------------------------------
  const cashBalance = totalCash ?? latestNumber(facts, "cash_and_equivalents");
  const cfoForRunway = latestNumber(facts, "operating_cash_flow") ??
    firstDatasetNumber(facts, ["cashflow"], ["operatingCashFlow", "netCashProvidedByOperatingActivities"]);
  if (cashBalance !== null && cfoForRunway !== null && cfoForRunway < 0) {
    // Monthly burn = -cfo / 12 (annual → monthly)
    const monthlyBurn = (-cfoForRunway) / 12;
    if (monthlyBurn > 0) {
      const runway = cashBalance / monthlyBurn;
      add("cash_runway_months", runway, "cash_balance / monthly_cash_burn", { cashBalance, monthlyBurn });
    }
  }

  // -----------------------------------------------------------------------
  // Phase A: WACC via gemeinsamer computeWACC (CAPM + Debt-Blend)
  // -----------------------------------------------------------------------
  const betaForWacc = metrics.beta ?? beta; // null → computeWACC nutzt Fallback 1.0
  const ev = enterpriseValue ?? latestNumber(facts, "enterprise_value");
  const netDebt = totalDebt !== null && totalCash !== null ? totalDebt - totalCash : null;
  const waccResult = computeWACC(betaForWacc, netDebt, ev);
  add(
    "wacc",
    waccResult.wacc,
    waccResult.fallbackBeta
      ? "CAPM+Debt-Blend (beta-Fallback=1.0): equity_weight*cost_equity + debt_weight*after_tax_cost_debt"
      : "CAPM+Debt-Blend: equity_weight*cost_equity + debt_weight*after_tax_cost_debt",
    { betaForWacc: betaForWacc ?? 1.0, fallbackBeta: waccResult.fallbackBeta, debtWeight: waccResult.debtWeight },
  );

  const roicVal = metrics.roic ?? null;
  if (roicVal !== null && waccResult.wacc > 0) {
    add("roic_wacc_spread", roicVal - waccResult.wacc, "roic - wacc", { roic: roicVal, wacc: waccResult.wacc });
  }

  // -----------------------------------------------------------------------
  // Phase A: Margin trends (linear slope over annual series)
  // -----------------------------------------------------------------------
  function computeMarginSeries(
    revenueSeriesIn: Array<{ date: string; value: number }>,
    profitField: string[],
    profitKeys: string[],
  ): Array<{ date: string; margin: number }> {
    const profitSeries = seriesFromDataset(facts, profitField, profitKeys);
    const result: Array<{ date: string; margin: number }> = [];
    for (const rev of revenueSeriesIn) {
      const prof = profitSeries.find((p) => p.date === rev.date);
      if (!prof || rev.value <= 0) continue;
      result.push({ date: rev.date, margin: prof.value / rev.value });
    }
    return result.sort((a, b) => a.date.localeCompare(b.date)); // ascending
  }

  function linearSlope(series: Array<{ date: string; margin: number }>): number | null {
    const n = series.length;
    if (n < 2) return null;
    // x = 0,1,...,n-1 (years from oldest)
    const xMean = (n - 1) / 2;
    const yMean = series.reduce((s, p) => s + p.margin, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const pt = series[i];
      if (!pt) continue;
      num += (i - xMean) * (pt.margin - yMean);
      den += (i - xMean) ** 2;
    }
    return den > 0 ? num / den : null;
  }

  function stdDev(series: Array<{ date: string; margin: number }>): number | null {
    if (series.length < 2) return null;
    const mean = series.reduce((s, p) => s + p.margin, 0) / series.length;
    const variance = series.reduce((s, p) => s + (p.margin - mean) ** 2, 0) / (series.length - 1);
    return Math.sqrt(variance);
  }

  const gmSeries = computeMarginSeries(
    revenueSeries,
    ["income_statement", "income-statement", "av_income_statement"],
    ["grossProfit", "gross_profit"],
  );
  const gmSlope = linearSlope(gmSeries);
  const gmStddev = stdDev(gmSeries);
  if (gmSlope !== null) add("gross_margin_trend", gmSlope, "linear slope of gross margin over annual series");
  if (gmStddev !== null) add("gross_margin_stddev", gmStddev, "stddev of gross margin over annual series");

  const omSeries = computeMarginSeries(
    revenueSeries,
    ["income_statement", "income-statement", "av_income_statement"],
    ["operatingIncome", "operating_income", "ebit"],
  );
  const omSlope = linearSlope(omSeries);
  const omStddev = stdDev(omSeries);
  if (omSlope !== null) add("operating_margin_trend", omSlope, "linear slope of operating margin over annual series");
  if (omStddev !== null) add("operating_margin_stddev", omStddev, "stddev of operating margin over annual series");

  const fcfSeries = computeMarginSeries(
    revenueSeries,
    ["cashflow", "cash-flow", "av_cash_flow"],
    ["freeCashFlow", "freeCashflow"],
  );
  const fcfSlope = linearSlope(fcfSeries);
  const fcfStddev = stdDev(fcfSeries);
  if (fcfSlope !== null) add("fcf_margin_trend", fcfSlope, "linear slope of fcf margin over annual series");
  if (fcfStddev !== null) add("fcf_margin_stddev", fcfStddev, "stddev of fcf margin over annual series");

  // -----------------------------------------------------------------------
  // Phase E: Reverse-DCF
  // -----------------------------------------------------------------------
  const reverseDcf = computeReverseDCF(
    ev,
    freeCashflow,
    metrics.wacc ?? null,
  );

  return { metrics, facts: derivedFacts, forensics: { piotroski, mohanram, altman, beneish }, reverseDcf };
}

export function mergeDeterministicMetrics(base: KeyMetrics, deterministic: Partial<KeyMetrics> | undefined): KeyMetrics {
  const merged: Record<string, number | null> = { ...base };
  if (deterministic) {
    for (const key of DERIVED_KEYS) {
      const value = deterministic[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        merged[key] = value;
      }
    }
  }
  return KeyMetricsSchema.parse(merged);
}

function trackNum(period: FinancialPeriod, key: keyof FinancialPeriod): number | null {
  const node = period[key];
  if (typeof node === "object" && node !== null && "value" in node) {
    const value = (node as { value: number | null }).value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return null;
}

function cagr(values: number[], years: number): number | null {
  if (values.length <= years) return null;
  const end = values[values.length - 1];
  const start = values[values.length - 1 - years];
  if (!end || !start || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function slope(series: number[]): number | null {
  if (series.length < 2) return null;
  const n = series.length;
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (series[i]! - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : null;
}

function stddevN(series: number[]): number | null {
  if (series.length < 2) return null;
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / (series.length - 1);
  return Math.sqrt(variance);
}

function valuationZ(value: number | null, hist: number[]): number | null {
  if (value === null || hist.length < 2) return null;
  const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
  const sd = stddevN(hist);
  if (sd === null || sd === 0) return null;
  return (value - mean) / sd;
}

export function deriveMetricsFromDataset(
  dataset: CompanyDataset,
): DerivedMetrics {
  const annual = dataset.annual;
  const quarterly = dataset.quarterly;

  const revenueA = annual.map((p) => trackNum(p, "revenue")).filter((v): v is number => v !== null);
  const ebitA = annual.map((p) => trackNum(p, "ebit")).filter((v): v is number => v !== null);
  const fcfA = annual.map((p) => trackNum(p, "freeCashflow")).filter((v): v is number => v !== null);

  const latestA = annual[annual.length - 1];
  const prevA = annual.length > 1 ? annual[annual.length - 2] : undefined;

  const revenue = latestA ? trackNum(latestA, "revenue") : null;
  const grossProfit = latestA ? trackNum(latestA, "grossProfit") : null;
  const ebit = latestA ? trackNum(latestA, "ebit") : null;
  const fcf = latestA ? trackNum(latestA, "freeCashflow") : null;
  const netIncome = latestA ? trackNum(latestA, "netIncome") : null;
  const totalDebt = latestA ? trackNum(latestA, "totalDebt") : null;
  const cash = latestA ? trackNum(latestA, "cashAndEquivalents") : null;
  const totalEquity = latestA ? trackNum(latestA, "totalEquity") : null;
  const totalAssets = latestA ? trackNum(latestA, "totalAssets") : null;
  const interestExpense = latestA ? trackNum(latestA, "interestExpense") : null;
  const capex = latestA ? trackNum(latestA, "capex") : null;
  const rnd = latestA ? trackNum(latestA, "researchAndDevelopment") : null;
  const sharesLatest = latestA ? trackNum(latestA, "sharesDiluted") : null;
  const sharesPrev = prevA ? trackNum(prevA, "sharesDiluted") : null;

  const grossMargin = revenue && grossProfit !== null ? grossProfit / revenue : null;
  const operatingMargin = revenue && ebit !== null ? ebit / revenue : null;
  const fcfMargin = revenue && fcf !== null ? fcf / revenue : null;

  const revenueQ = quarterly.map((p) => trackNum(p, "revenue"));
  const revenueYoYRates: number[] = [];
  for (let i = 4; i < revenueQ.length; i += 1) {
    const cur = revenueQ[i];
    const prev = revenueQ[i - 4];
    if (typeof cur === "number" && typeof prev === "number" && prev > 0) {
      revenueYoYRates.push(cur / prev - 1);
    }
  }
  const revenueAcceleration =
    revenueYoYRates.length >= 2
      ? revenueYoYRates[revenueYoYRates.length - 1]! - revenueYoYRates[revenueYoYRates.length - 2]!
      : null;

  const marginsFromAnnual = (field: "grossProfit" | "ebit" | "freeCashflow"): number[] =>
    annual
      .map((p) => {
        const rev = trackNum(p, "revenue");
        const val = trackNum(p, field);
        return rev && val !== null ? val / rev : null;
      })
      .filter((v): v is number => v !== null);

  const gmSeries = marginsFromAnnual("grossProfit");
  const omSeries = marginsFromAnnual("ebit");
  const fcfSeries = marginsFromAnnual("freeCashflow");

  const grossMarginTrend = slope(gmSeries);
  const operatingMarginTrend = slope(omSeries);
  const fcfMarginTrend = slope(fcfSeries);

  const investedCapital =
    totalDebt !== null && totalEquity !== null && cash !== null ? totalDebt + totalEquity - cash : null;
  const roic = investedCapital !== null && investedCapital > 0 && ebit !== null ? ebit * (1 - THRESHOLDS.wacc_tax_rate) / investedCapital : null;
  const roce = totalAssets !== null && totalAssets > 0 && ebit !== null ? ebit / totalAssets : null;
  const roe = totalEquity !== null && totalEquity > 0 && netIncome !== null ? netIncome / totalEquity : null;
  // wacc und roicWaccSpread werden nach enterpriseValue berechnet (CAPM+Debt-Blend via computeWACC).
  // Niemals stiller Fallback rf+erp — computeWACC dokumentiert den beta-Fallback explizit.
  let wacc: number | null = null;
  let roicWaccSpread: number | null = null;

  const prevInvestedCapital =
    prevA && trackNum(prevA, "totalDebt") !== null && trackNum(prevA, "totalEquity") !== null && trackNum(prevA, "cashAndEquivalents") !== null
      ? (trackNum(prevA, "totalDebt") as number) + (trackNum(prevA, "totalEquity") as number) - (trackNum(prevA, "cashAndEquivalents") as number)
      : null;
  const prevEbit = prevA ? trackNum(prevA, "ebit") : null;
  const roiic =
    investedCapital !== null && prevInvestedCapital !== null && ebit !== null && prevEbit !== null && investedCapital !== prevInvestedCapital
      ? ((ebit - prevEbit) * (1 - THRESHOLDS.wacc_tax_rate)) / (investedCapital - prevInvestedCapital)
      : null;

  const cashConversion = netIncome !== null && netIncome !== 0 && fcf !== null ? fcf / netIncome : null;
  const rAndDIntensity = revenue && rnd !== null ? rnd / revenue : null;
  const capexIntensity = revenue && capex !== null ? Math.abs(capex) / revenue : null;

  const netDebt = totalDebt !== null && cash !== null ? totalDebt - cash : null;
  // EBITDA aus Period-Daten lesen. Kein EBIT-als-Ersatz — das bricht die Audit-Integrität.
  // D&A ist kein separates Schema-Feld → null wenn ebitda-Feld fehlt (Coverage sinkt).
  const ebitdaForDebt = latestA ? trackNum(latestA, "ebitda") : null;
  const netDebtToEbitda =
    netDebt !== null && ebitdaForDebt !== null && ebitdaForDebt > 0 ? netDebt / ebitdaForDebt : null;
  const interestCoverage = interestExpense !== null && interestExpense > 0 && ebit !== null ? ebit / interestExpense : null;
  const equityRatio = totalAssets !== null && totalAssets > 0 && totalEquity !== null ? totalEquity / totalAssets : null;
  const cashRunwayMonths = quarterly.length > 0
    ? (() => {
        const recent4 = quarterly.slice(-4);
        const fcfSum = recent4
          .map((p) => trackNum(p, "freeCashflow"))
          .filter((v): v is number => v !== null)
          .reduce((s, v) => s + v, 0);
        if (cash === null || fcfSum >= 0) return null;
        const monthlyBurn = Math.abs(fcfSum) / 12;
        return monthlyBurn > 0 ? cash / monthlyBurn : null;
      })()
    : null;

  const operatingCashflow = latestA ? trackNum(latestA, "operatingCashflow") : null;
  const accrualsRatio =
    netIncome !== null && operatingCashflow !== null && totalAssets !== null && totalAssets > 0
      ? (netIncome - operatingCashflow) / totalAssets
      : null;
  const dilutionOverhang =
    sharesLatest !== null && sharesPrev !== null && sharesPrev > 0 ? sharesLatest / sharesPrev - 1 : null;

  const currentPrice = dataset.prices.daily.at(-1)?.close ?? null;
  const shares = dataset.ownership.sharesOutstanding;
  const marketCap = currentPrice !== null && shares !== null ? currentPrice * shares : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
  // WACC: CAPM+Debt-Blend via computeWACC. Beta nicht im Dataset-Schema verfügbar → Fallback 1.0.
  // Kein stiller rf+erp-Fallback — fallbackBeta=true im Rückgabewert dokumentiert diesen Pfad.
  const waccFromEV = computeWACC(null, netDebt, enterpriseValue);
  wacc = waccFromEV.wacc;
  roicWaccSpread = roic !== null ? roic - wacc : null;

  // roicAdj: ROIC mit kapitalisiertem F&E nach Mauboussin-Steady-State-Methode.
  // capitalizedRnD ≈ annualRnD * (rndLife - 1) = annualRnD * 2 (für 5-Jahres-Linear).
  // Im Steady State bleibt NOPAT gleich; nur IC wird um den kapitalisierten Bestand erhöht.
  const annualRnD = latestA ? (trackNum(latestA, "researchAndDevelopment") ?? 0) : 0;
  const rndLife = 5; // Mauboussin: F&E Nutzungsdauer Jahre
  const capitalizedRnD = annualRnD * (rndLife - 1); // Buchwert des kapitalisierten Bestands (steady state)
  const roicAdj: number | null =
    roic !== null && investedCapital !== null && investedCapital > 0 && annualRnD > 0
      ? (roic * investedCapital) / (investedCapital + capitalizedRnD) // NOPAT / adjustedIC
      : roic; // kein F&E → unverändert

  // roicFadeRate: linearer Trend von ROIC über die letzten 5 Jahreswerte (positiv = verbessernd).
  const roicFadeRate: number | null = (() => {
    const taxRate = 0.21;
    const roicSeries = dataset.annual
      .slice(-5)
      .map((a: (typeof dataset.annual)[number]) => {
        const ebitVal = trackNum(a, "ebit");
        const equityVal = trackNum(a, "totalEquity");
        const debtVal: number = trackNum(a, "totalDebt") ?? 0;
        const cashVal: number = trackNum(a, "cashAndEquivalents") ?? 0;
        if (ebitVal === null || equityVal === null) return null;
        const ic = equityVal + debtVal - cashVal;
        if (ic <= 0) return null;
        return (ebitVal * (1 - taxRate)) / ic;
      })
      .filter((v): v is number => v !== null);
    // Simple linear regression slope
    const sumX2 = roicSeries.reduce((s: number, _: number, i: number) => s + i * i, 0);
    if (roicSeries.length < 3) return null;
    const n = roicSeries.length;
    const sumX = roicSeries.reduce((s: number, _: number, i: number) => s + i, 0);
    const sumY = roicSeries.reduce((s: number, v: number) => s + v, 0);
    const sumXY = roicSeries.reduce((s: number, v: number, i: number) => s + i * v, 0);
    const denom = n * sumX2 - sumX * sumX;
    return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : null;
  })();
  const evSales = enterpriseValue !== null && revenue !== null && revenue > 0 ? enterpriseValue / revenue : null;
  const evGrossProfit = enterpriseValue !== null && grossProfit !== null && grossProfit > 0 ? enterpriseValue / grossProfit : null;
  const pe = marketCap !== null && netIncome !== null && netIncome > 0 ? marketCap / netIncome : null;
  const pfcf = marketCap !== null && fcf !== null && fcf > 0 ? marketCap / fcf : null;
  const fcfYield = marketCap !== null && marketCap > 0 && fcf !== null ? fcf / marketCap : null;
  const dividendYield =
    latestA && trackNum(latestA, "dividendPerShare") !== null && currentPrice !== null && currentPrice > 0
      ? (trackNum(latestA, "dividendPerShare") as number) / currentPrice
      : null;
  const evEbit = enterpriseValue !== null && ebit !== null && ebit > 0 ? enterpriseValue / ebit : null;

  const evSalesHist = annual
    .map((p) => {
      const rev = trackNum(p, "revenue");
      const ebitV = trackNum(p, "ebit");
      if (rev === null || rev <= 0 || ebitV === null) return null;
      return rev / Math.max(Math.abs(ebitV), 1);
    })
    .filter((v): v is number => v !== null);

  const est = dataset.estimates;
  const revenueCagr3yFwd = est.revenueCagr3yFwd;
  const ebitCagr3yFwd = est.ebitCagr3yFwd;

  const beatSeries = dataset.earningsHistory
    .slice(-8)
    .map((e) => (typeof e.surprisePct === "number" ? e.surprisePct : null));
  const validBeats = beatSeries.filter((v): v is number => v !== null);
  const beatStreak =
    validBeats.length > 0
      ? [...validBeats].reverse().findIndex((v) => v <= 0) === -1
        ? validBeats.length
        : [...validBeats].reverse().findIndex((v) => v <= 0)
      : null;
  const sue = validBeats.length > 1 ? (validBeats.at(-1)! - (validBeats.reduce((s, v) => s + v, 0) / validBeats.length)) / (stddevN(validBeats) ?? 1) : null;

  const revisionsBalance =
    dataset.analyst.upgrades3m !== null && dataset.analyst.downgrades3m !== null
      ? dataset.analyst.upgrades3m - dataset.analyst.downgrades3m
      : null;
  const upsideToTargetPct =
    dataset.analyst.targetMean !== null && currentPrice !== null && currentPrice > 0
      ? dataset.analyst.targetMean / currentPrice - 1
      : null;

  return {
    revenueCagr3y: cagr(revenueA, 3),
    revenueCagr5y: cagr(revenueA, 5),
    revenueCagr10y: cagr(revenueA, 10),
    ebitCagr3y: cagr(ebitA, 3),
    ebitCagr10y: cagr(ebitA, 10),
    fcfCagr5y: cagr(fcfA, 5),
    revenueAcceleration,
    revenueCagr3yFwd,
    ebitCagr3yFwd,
    grossMargin,
    operatingMargin,
    fcfMargin,
    grossMarginTrend,
    operatingMarginTrend,
    fcfMarginTrend,
    grossMarginStddev: stddevN(gmSeries),
    operatingMarginStddev: stddevN(omSeries),
    fcfMarginStddev: stddevN(fcfSeries),
    roic,
    roce,
    roe,
    wacc,
    roicWaccSpread,
    roicAdj,
    roicFadeRate,
    roiic,
    cashConversion,
    rAndDIntensity,
    capexIntensity,
    netDebtToEbitda,
    interestCoverage,
    equityRatio,
    cashRunwayMonths,
    accrualsRatio,
    dilutionOverhang,
    evSales,
    evGrossProfit,
    pe,
    peg: pe !== null && revenueCagr3yFwd !== null && revenueCagr3yFwd > 0 ? pe / (revenueCagr3yFwd * 100) : null,
    evEbitToGrowth: evEbit !== null && ebitCagr3yFwd !== null && ebitCagr3yFwd > 0 ? evEbit / (ebitCagr3yFwd * 100) : null,
    evSalesToGrowth: evSales !== null && revenueCagr3yFwd !== null && revenueCagr3yFwd > 0 ? evSales / (revenueCagr3yFwd * 100) : null,
    pegFallbackLevel: (() => {
      // Level 1: forward PEG (requires positive earnings + positive fwd growth)
      if (pe !== null && revenueCagr3yFwd !== null && revenueCagr3yFwd > 0) return 1;
      // Level 2: EV/EBIT-to-Growth (requires positive EBIT + fwd growth)
      if (evEbit !== null && ebitCagr3yFwd !== null && ebitCagr3yFwd > 0) return 2;
      // Level 3: EV/GP alone (positive gross profit)
      if (evGrossProfit !== null) return 3;
      // Level 4: PSG (EV/Sales, always last resort)
      if (evSales !== null && revenueCagr3yFwd !== null && revenueCagr3yFwd > 0) return 4;
      return null;
    })() as 1 | 2 | 3 | 4 | null,
    pfcf,
    fcfYield,
    dividendYield,
    evEbit,
    valuationZ: {
      evSales: valuationZ(evSales, evSalesHist),
      evGrossProfit: valuationZ(evGrossProfit, evSalesHist),
      pe: valuationZ(pe, evSalesHist),
      pfcf: valuationZ(pfcf, evSalesHist),
    },
    sue,
    beatStreak,
    revisionsBalance,
    upsideToTargetPct,
    guidanceTrend: dataset.estimates.guidanceTrend,
    institutionalTrend: dataset.ownership.institutionalTrend,
    shortInterestPctFloat: dataset.shortInterest.pctOfFloat,
    daysToCover: dataset.shortInterest.daysToCover,
  };
}
