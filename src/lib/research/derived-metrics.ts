import type { ProviderFact } from "@/lib/providers/types";
import { KeyMetricsSchema, type KeyMetrics } from "@/lib/schemas/report";

export interface DerivedMetricsResult {
  metrics: Partial<KeyMetrics>;
  facts: ProviderFact[];
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

  return { metrics, facts: derivedFacts };
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
