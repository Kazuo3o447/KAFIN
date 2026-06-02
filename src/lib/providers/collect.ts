import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { activeProvidersV2, providersForCapability } from "@/lib/providers";
import type {
  Capability,
  CapabilityFetchDiagnostic,
  DataProviderV2,
  GatherDiagnostics,
  MissingValueStatus,
  ProviderContext,
  ProviderFetchResultV2,
  Provenance,
} from "@/lib/providers/types";
import { THRESHOLDS } from "@/lib/research/thresholds";
import {
  AnalystSchema,
  CompanyDatasetSchema,
  type CoverageReport,
  CoverageReportSchema,
  type FinancialPeriod,
  FinancialPeriodSchema,
  MarketContextSchema,
  type CompanyDataset,
  type MarketContext,
  type Ownership,
  OwnershipSchema,
  type ShortInterest,
  ShortInterestSchema,
  type NewsSentiment,
  NewsSentimentSchema,
  tracked,
} from "@/lib/schemas/dataset";
import { resolveSymbol } from "@/lib/providers/symbol-resolution";
import { atomicWrite } from "@/lib/utils/atomic-write";

const DATA_DIR = process.env.DATA_DIR || "./data";

const COMPANY_CAPABILITIES: Capability[] = [
  "fundamentals_annual",
  "fundamentals_quarterly",
  "estimates",
  "earnings_history",
  "prices",
  "insider",
  "institutional",
  "short_interest",
  "analyst",
  "segments",
  "news_sentiment",
];

interface GatherOptions {
  asOf?: string;
  runId?: string;
  providers?: DataProviderV2[];
  skipSymbolResolution?: boolean;
}

function makeRunId(): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `${Date.now().toString(36)}-${rand}`;
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
}

function withStale(prov: Provenance, runDate: string): Provenance {
  const asOf = prov.asOf;
  const stale = typeof asOf === "string" && asOf.length > 0
    ? monthsBetween(asOf, runDate) > THRESHOLDS.stale_data_max_months
    : false;
  return {
    source: prov.source,
    url: prov.url,
    klass: prov.klass,
    asOf: asOf ?? null,
    stale,
  };
}

function defaultProvenance(source: string, runDate: string, klass: Provenance["klass"] = "B"): Provenance {
  return {
    source,
    url: `about:${source}`,
    klass,
    asOf: runDate,
    stale: false,
  };
}

function firstProvenance(result: ProviderFetchResultV2, runDate: string): Provenance {
  const first = result.provenance[0];
  if (!first) return defaultProvenance(result.provider, runDate);
  return withStale(first, runDate);
}

function persistRaw(ticker: string, runId: string, cap: Capability, result: ProviderFetchResultV2): void {
  const baseDir = path.join(DATA_DIR, "raw", ticker.toUpperCase(), runId, result.provider);
  fs.mkdirSync(baseDir, { recursive: true });
  for (const raw of result.raw) {
    const normalizedName = raw.name.endsWith(".json") || raw.name.endsWith(".csv") || raw.name.endsWith(".txt")
      ? raw.name
      : `${raw.name}.json`;
    const filePath = path.join(baseDir, `${cap}_${normalizedName}`);
    const payload = typeof raw.data === "string" ? raw.data : JSON.stringify(raw.data, null, 2);
    atomicWrite(filePath, payload);
  }
}

async function fetchWithFallback(
  cap: Capability,
  providers: DataProviderV2[],
  ctx: ProviderContext,
): Promise<{ result: ProviderFetchResultV2 | null; diagnostic: CapabilityFetchDiagnostic }> {
  const ordered = providers
    .filter((p) => p.available() && p.capabilities.includes(cap))
    .sort(
      (a, b) =>
        (a.priorityByCapability[cap] ?? Number.MAX_SAFE_INTEGER) -
        (b.priorityByCapability[cap] ?? Number.MAX_SAFE_INTEGER),
    );

  if (ordered.length === 0) {
    return {
      result: null,
      diagnostic: {
        capability: cap,
        status: "not_reported",
        providerTried: [],
        providerUsed: null,
        retries: 0,
        errors: ["no provider available for capability"],
      },
    };
  }

  const providerTried: string[] = [];
  const errors: string[] = [];
  let retries = 0;
  let hadRateLimit = false;

  const maxRetries = THRESHOLDS.provider_fetch_max_retries;
  const backoffBase = THRESHOLDS.provider_fetch_backoff_ms;
  const backoffFactor = THRESHOLDS.provider_fetch_backoff_factor;

  const classifyError = (err: string | undefined): MissingValueStatus => {
    const text = String(err ?? "").toLowerCase();
    if (text.includes("rate") && text.includes("limit")) return "rate_limited";
    if (text.includes("429")) return "rate_limited";
    return "fetch_failed";
  };

  const wait = async (ms: number) => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  };

  for (const provider of ordered) {
    providerTried.push(provider.name);
    let attempt = 0;
    while (attempt <= maxRetries) {
      const result = await provider.fetch(cap, ctx);
      if (result.ok && result.data !== null && (!Array.isArray(result.data) || result.data.length > 0)) {
        return {
          result: {
            ...result,
            status: "available",
          },
          diagnostic: {
            capability: cap,
            status: "available",
            providerTried,
            providerUsed: provider.name,
            retries,
            errors,
          },
        };
      }

      const status = classifyError(result.error);
      if (status === "rate_limited") hadRateLimit = true;

      if (!result.ok && attempt < maxRetries && (status === "rate_limited" || status === "fetch_failed")) {
        const delay = backoffBase * Math.pow(backoffFactor, attempt);
        retries += 1;
        attempt += 1;
        await wait(delay);
        continue;
      }

      if (!result.ok && result.error) {
        errors.push(`${provider.name}: ${result.error}`);
      }
      break;
    }
  }

  return {
    result: null,
    diagnostic: {
      capability: cap,
      status: hadRateLimit ? "rate_limited" : "fetch_failed",
      providerTried,
      providerUsed: null,
      retries,
      errors,
    },
  };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowDate(row: Record<string, unknown>): string | null {
  for (const key of ["periodEnd", "date", "fiscalDateEnding", "end"]) {
    const value = row[key];
    if (typeof value === "string" && value.length >= 4) return value.slice(0, 10);
  }
  return null;
}

function mapRowsToFinancialPeriods(rows: Record<string, unknown>[], provenance: Provenance): FinancialPeriod[] {
  return rows
    .map((row) => {
      const periodEnd = rowDate(row);
      if (!periodEnd) return null;
      const period: FinancialPeriod = FinancialPeriodSchema.parse({
        periodEnd,
        fiscalYear: toNum(row.fiscalYear ?? row.calendarYear),
        fiscalQuarter: toNum(row.fiscalQuarter ?? row.quarter),
        revenue: tracked(toNum(row.revenue), provenance),
        grossProfit: tracked(toNum(row.grossProfit), provenance),
        ebit: tracked(toNum(row.ebit ?? row.operatingIncome), provenance),
        ebitda: tracked(toNum(row.ebitda), provenance),
        netIncome: tracked(toNum(row.netIncome), provenance),
        operatingCashflow: tracked(toNum(row.operatingCashflow ?? row.operatingCashFlow), provenance),
        capex: tracked(toNum(row.capex ?? row.capitalExpenditure), provenance),
        freeCashflow: tracked(toNum(row.freeCashflow ?? row.freeCashFlow), provenance),
        sharesDiluted: tracked(toNum(row.sharesDiluted ?? row.weightedAverageShsOutDil), provenance),
        dividendPerShare: tracked(toNum(row.dividendPerShare), provenance),
        totalDebt: tracked(toNum(row.totalDebt), provenance),
        cashAndEquivalents: tracked(toNum(row.cashAndEquivalents ?? row.cashAndCashEquivalents), provenance),
        totalEquity: tracked(toNum(row.totalEquity ?? row.totalStockholdersEquity), provenance),
        totalAssets: tracked(toNum(row.totalAssets), provenance),
        interestExpense: tracked(toNum(row.interestExpense), provenance),
        researchAndDevelopment: tracked(toNum(row.researchAndDevelopment ?? row.researchAndDevelopmentExpenses), provenance),
        stockBasedComp: tracked(toNum(row.stockBasedComp ?? row.stockBasedCompensation), provenance),
        inventory: tracked(toNum(row.inventory), provenance),
        accountsReceivable: tracked(toNum(row.accountsReceivable ?? row.netReceivables), provenance),
        shareRepurchases: tracked(toNum(row.shareRepurchases ?? row.commonStockRepurchased), provenance),
      });
      return period;
    })
    .filter((r): r is FinancialPeriod => r !== null)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

function mapFmpLikeFinancials(payload: Record<string, unknown>, provenance: Provenance): FinancialPeriod[] {
  const income = Array.isArray(payload.income)
    ? (payload.income as Record<string, unknown>[])
    : [];
  const balance = Array.isArray(payload.balance)
    ? (payload.balance as Record<string, unknown>[])
    : [];
  const cashflow = Array.isArray(payload.cashflow)
    ? (payload.cashflow as Record<string, unknown>[])
    : [];

  const byDate = new Map<string, Record<string, unknown>>();
  for (const row of income) {
    const date = rowDate(row);
    if (!date) continue;
    byDate.set(date, {
      ...(byDate.get(date) ?? { periodEnd: date }),
      ...row,
      periodEnd: date,
    });
  }
  for (const row of balance) {
    const date = rowDate(row);
    if (!date) continue;
    byDate.set(date, {
      ...(byDate.get(date) ?? { periodEnd: date }),
      ...row,
      periodEnd: date,
    });
  }
  for (const row of cashflow) {
    const date = rowDate(row);
    if (!date) continue;
    byDate.set(date, {
      ...(byDate.get(date) ?? { periodEnd: date }),
      ...row,
      periodEnd: date,
    });
  }

  return mapRowsToFinancialPeriods(Array.from(byDate.values()), provenance);
}

function parseFundamentals(result: ProviderFetchResultV2 | null, runDate: string): FinancialPeriod[] {
  if (!result || !result.data) return [];
  const prov = firstProvenance(result, runDate);
  if (Array.isArray(result.data)) {
    return mapRowsToFinancialPeriods(
      result.data.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null),
      prov,
    );
  }
  if (typeof result.data === "object" && result.data !== null) {
    return mapFmpLikeFinancials(result.data as Record<string, unknown>, prov);
  }
  return [];
}

function parseEstimates(result: ProviderFetchResultV2 | null, runDate: string): CompanyDataset["estimates"] {
  const provenance = result ? result.provenance.map((p) => withStale(p, runDate)) : [];
  if (!result || !result.data) {
    return {
      revenueFwd: [],
      ebitFwd: [],
      epsFwd: [],
      revenueCagr3yFwd: null,
      ebitCagr3yFwd: null,
      guidanceTrend: null,
      provenance,
    };
  }

  const d = result.data as Record<string, unknown>;
  const rev = Array.isArray(d.revenueFwd)
    ? (d.revenueFwd as Array<Record<string, unknown>>).map((x) => ({ year: Number(x.year), value: toNum(x.value) }))
    : [];
  const ebit = Array.isArray(d.ebitFwd)
    ? (d.ebitFwd as Array<Record<string, unknown>>).map((x) => ({ year: Number(x.year), value: toNum(x.value) }))
    : [];
  const eps = Array.isArray(d.epsFwd)
    ? (d.epsFwd as Array<Record<string, unknown>>).map((x) => ({ year: Number(x.year), value: toNum(x.value) }))
    : [];

  return {
    revenueFwd: rev.filter((x) => Number.isFinite(x.year)).sort((a, b) => a.year - b.year),
    ebitFwd: ebit.filter((x) => Number.isFinite(x.year)).sort((a, b) => a.year - b.year),
    epsFwd: eps.filter((x) => Number.isFinite(x.year)).sort((a, b) => a.year - b.year),
    revenueCagr3yFwd: toNum(d.revenueCagr3yFwd),
    ebitCagr3yFwd: toNum(d.ebitCagr3yFwd),
    guidanceTrend:
      d.guidanceTrend === "raised" || d.guidanceTrend === "maintained" || d.guidanceTrend === "lowered"
        ? d.guidanceTrend
        : null,
    provenance,
  };
}

function parseCoverage(dataset: Omit<CompanyDataset, "coverage">): CoverageReport {
  const growthTotal = 6;
  const growthFilled = [
    dataset.annual.length >= 10,
    dataset.quarterly.length >= 12,
    dataset.estimates.revenueFwd.length >= 3,
    dataset.earningsHistory.length >= 8,
    dataset.prices.daily.length >= 252 * 3,
    dataset.segments.length > 0 || dataset.saas !== null,
  ].filter(Boolean).length;

  const profitabilityTotal = 4;
  const profitabilityFilled = [
    dataset.annual.some((p) => p.grossProfit.value !== null),
    dataset.annual.some((p) => p.ebit.value !== null),
    dataset.annual.some((p) => p.freeCashflow.value !== null),
    dataset.quarterly.some((p) => p.operatingCashflow.value !== null),
  ].filter(Boolean).length;

  const riskTotal = 4;
  const riskFilled = [
    dataset.annual.some((p) => p.totalDebt.value !== null),
    dataset.annual.some((p) => p.cashAndEquivalents.value !== null),
    dataset.annual.some((p) => p.totalEquity.value !== null),
    dataset.shortInterest.asOf !== null,
  ].filter(Boolean).length;

  const valuationTotal = 3;
  const valuationFilled = [
    dataset.analyst.targetMean !== null,
    dataset.estimates.epsFwd.length > 0,
    dataset.estimates.revenueFwd.length > 0,
  ].filter(Boolean).length;

  const momentumTotal = 4;
  const momentumFilled = [
    dataset.earningsHistory.length >= 8,
    dataset.analyst.count !== null,
    dataset.prices.daily.length >= 252,
    dataset.newsSentiment.score !== null,
  ].filter(Boolean).length;

  const ownershipTotal = 4;
  const ownershipFilled = [
    dataset.ownership.institutionalPctHeld !== null,
    dataset.ownership.insiderOwnershipPct !== null,
    dataset.insiderTransactions.length > 0,
    dataset.shortInterest.pctOfFloat !== null || dataset.shortInterest.sharesShort !== null,
  ].filter(Boolean).length;

  const anyStale = (provenance: Provenance[]): boolean => provenance.some((p) => p.stale);
  const growthStale = anyStale(dataset.estimates.provenance) || anyStale(dataset.prices.provenance);
  const riskStale = anyStale(dataset.shortInterest.provenance);
  const ownershipStale = anyStale(dataset.ownership.provenance);

  const coverage = CoverageReportSchema.parse({
    growth: {
      filled: growthFilled,
      total: growthTotal,
      ratio: growthTotal > 0 ? growthFilled / growthTotal : 0,
      anyStale: growthStale,
    },
    profitability: {
      filled: profitabilityFilled,
      total: profitabilityTotal,
      ratio: profitabilityTotal > 0 ? profitabilityFilled / profitabilityTotal : 0,
      anyStale: false,
    },
    risk: {
      filled: riskFilled,
      total: riskTotal,
      ratio: riskTotal > 0 ? riskFilled / riskTotal : 0,
      anyStale: riskStale,
    },
    valuation: {
      filled: valuationFilled,
      total: valuationTotal,
      ratio: valuationTotal > 0 ? valuationFilled / valuationTotal : 0,
      anyStale: false,
    },
    momentum_sentiment: {
      filled: momentumFilled,
      total: momentumTotal,
      ratio: momentumTotal > 0 ? momentumFilled / momentumTotal : 0,
      anyStale: false,
    },
    ownership_smart_money: {
      filled: ownershipFilled,
      total: ownershipTotal,
      ratio: ownershipTotal > 0 ? ownershipFilled / ownershipTotal : 0,
      anyStale: ownershipStale,
    },
    overallRatio:
      (growthFilled + profitabilityFilled + riskFilled + valuationFilled + momentumFilled + ownershipFilled) /
      (growthTotal + profitabilityTotal + riskTotal + valuationTotal + momentumTotal + ownershipTotal),
  });

  return coverage;
}

export async function gatherCompanyDataset(input: string, options: GatherOptions = {}): Promise<CompanyDataset> {
  const detailed = await gatherCompanyDatasetDetailed(input, options);
  return detailed.dataset;
}

export async function gatherCompanyDatasetDetailed(
  input: string,
  options: GatherOptions = {},
): Promise<{ dataset: CompanyDataset; diagnostics: GatherDiagnostics }> {
  const runDate = options.asOf ?? new Date().toISOString().slice(0, 10);
  const runId = options.runId ?? makeRunId();

  const resolved = options.skipSymbolResolution
    ? {
        input,
        ticker: input.trim().toUpperCase(),
        exchange: null,
        name: null,
        isin: null,
        wkn: null,
        currency: null,
        country: null,
        source: "cache" as const,
        url: `about:${input.trim().toUpperCase()}`,
        asOf: runDate,
      }
    : await resolveSymbol(input);
  const ticker = resolved.ticker;
  const providerList = options.providers ?? activeProvidersV2();

  const ctx: ProviderContext = {
    ticker,
    runDate,
    runId,
  };

  const capabilities = COMPANY_CAPABILITIES;
  const settled = await Promise.allSettled(
    capabilities.map(async (cap) => {
      const { result, diagnostic } = await fetchWithFallback(cap, providerList, ctx);
      if (result) persistRaw(ticker, runId, cap, result);
      return { cap, result, diagnostic };
    }),
  );

  const byCap = new Map<Capability, ProviderFetchResultV2 | null>();
  const diagnosticsByCap = new Map<Capability, CapabilityFetchDiagnostic>();
  for (const s of settled) {
    if (s.status === "fulfilled") {
      byCap.set(s.value.cap, s.value.result);
      diagnosticsByCap.set(s.value.cap, s.value.diagnostic);
    }
  }

  const annual = parseFundamentals(byCap.get("fundamentals_annual") ?? null, runDate);
  const quarterly = parseFundamentals(byCap.get("fundamentals_quarterly") ?? null, runDate);

  const pricesResult = byCap.get("prices") ?? null;
  const pricesProv = pricesResult ? pricesResult.provenance.map((p) => withStale(p, runDate)) : [];
  const pricesData = pricesResult?.data as Record<string, unknown> | undefined;

  const earningsResult = byCap.get("earnings_history") ?? null;
  const earningsHistory = Array.isArray(earningsResult?.data)
    ? (earningsResult?.data as Array<Record<string, unknown>>).map((e) => ({
        date: typeof e.date === "string" ? e.date : runDate,
        epsActual: toNum(e.epsActual),
        epsEstimate: toNum(e.epsEstimate),
        surprisePct: toNum(e.surprisePct),
        revenueActual: toNum(e.revenueActual),
        revenueEstimate: toNum(e.revenueEstimate),
        revenueSurprisePct: toNum(e.revenueSurprisePct),
      }))
    : [];

  const ownershipBase = byCap.get("institutional")?.data as Record<string, unknown> | undefined;
  const ownershipProv = byCap.get("institutional")
    ? (byCap.get("institutional")?.provenance ?? []).map((p) => withStale(p, runDate))
    : [];
  const ownership: Ownership = OwnershipSchema.parse({
    institutionalPctHeld: toNum(ownershipBase?.institutionalPctHeld),
    institutionalQoqChangePp: toNum(ownershipBase?.institutionalQoqChangePp),
    institutionalTrend:
      ownershipBase?.institutionalTrend === "accumulating" ||
      ownershipBase?.institutionalTrend === "distributing" ||
      ownershipBase?.institutionalTrend === "flat"
        ? ownershipBase.institutionalTrend
        : null,
    insiderOwnershipPct: toNum(ownershipBase?.insiderOwnershipPct),
    sharesOutstanding: toNum(ownershipBase?.sharesOutstanding),
    floatShares: toNum(ownershipBase?.floatShares),
    provenance: ownershipProv,
  });

  const insiderResult = byCap.get("insider") ?? null;
  const insiderProv = insiderResult ? insiderResult.provenance.map((p) => withStale(p, runDate)) : [];
  const insiderTransactions = Array.isArray(insiderResult?.data)
    ? (insiderResult.data as Array<Record<string, unknown>>).map((row) => {
        const role: "CEO" | "CFO" | "director" | "officer" | "other" =
          row.role === "CEO" || row.role === "CFO" || row.role === "director" || row.role === "officer"
            ? row.role
            : "other";
        const type: "buy" | "sell" = row.type === "buy" ? "buy" : "sell";
        return {
          date: typeof row.date === "string" ? row.date : runDate,
          insiderName: typeof row.insiderName === "string" ? row.insiderName : "Unknown",
          role,
          type,
          valueUsd: toNum(row.valueUsd),
          shares: toNum(row.shares),
          isOpenMarket: Boolean(row.isOpenMarket),
          provenance: insiderProv,
        };
      })
    : [];

  const shortResult = byCap.get("short_interest") ?? null;
  const shortData = shortResult?.data as Record<string, unknown> | undefined;
  const shortInterest: ShortInterest = ShortInterestSchema.parse({
    pctOfFloat: toNum(shortData?.pctOfFloat),
    daysToCover: toNum(shortData?.daysToCover),
    sharesShort: toNum(shortData?.sharesShort),
    trend: shortData?.trend === "rising" || shortData?.trend === "falling" || shortData?.trend === "flat" ? shortData.trend : null,
    provenance: shortResult ? shortResult.provenance.map((p) => withStale(p, runDate)) : [],
    asOf: typeof shortData?.asOf === "string" ? shortData.asOf : null,
  });

  const sentimentResult = byCap.get("news_sentiment") ?? null;
  const sentimentData = sentimentResult?.data as Record<string, unknown> | undefined;
  const newsSentiment: NewsSentiment = NewsSentimentSchema.parse({
    score: toNum(sentimentData?.score),
    bullishPct: toNum(sentimentData?.bullishPct),
    bearishPct: toNum(sentimentData?.bearishPct),
    articlesInLastWeek: toNum(sentimentData?.articlesInLastWeek),
    buzz: toNum(sentimentData?.buzz),
    provenance: sentimentResult ? sentimentResult.provenance.map((p) => withStale(p, runDate)) : [],
    asOf: runDate,
  });

  const segmentResult = byCap.get("segments") ?? null;
  const segmentData = segmentResult?.data as Record<string, unknown> | undefined;
  const segments = Array.isArray(segmentData?.segments)
    ? (segmentData?.segments as Array<Record<string, unknown>>).map((s) => ({
        name: typeof s.name === "string" ? s.name : "Unknown",
        revenueByPeriod: Array.isArray(s.revenueByPeriod)
          ? (s.revenueByPeriod as Array<Record<string, unknown>>).map((rp) => ({
              periodEnd: typeof rp.periodEnd === "string" ? rp.periodEnd : runDate,
              value: toNum(rp.value),
            }))
          : [],
        provenance: segmentResult ? segmentResult.provenance.map((p) => withStale(p, runDate)) : [],
      }))
    : [];
  const saas = segmentData?.saas && typeof segmentData.saas === "object"
    ? {
        netRevenueRetention: toNum((segmentData.saas as Record<string, unknown>).netRevenueRetention),
        remainingPerformanceObligations: toNum((segmentData.saas as Record<string, unknown>).remainingPerformanceObligations),
        deferredRevenue: toNum((segmentData.saas as Record<string, unknown>).deferredRevenue),
        arr: toNum((segmentData.saas as Record<string, unknown>).arr),
        provenance: segmentResult ? segmentResult.provenance.map((p) => withStale(p, runDate)) : [],
      }
    : null;

  const analystData = byCap.get("analyst")?.data as Record<string, unknown> | undefined;
  const analyst = AnalystSchema.parse({
    count: toNum(analystData?.count),
    recommendationMean: toNum(analystData?.recommendationMean),
    targetMean: toNum(analystData?.targetMean),
    targetHigh: toNum(analystData?.targetHigh),
    targetLow: toNum(analystData?.targetLow),
    upgrades3m: toNum(analystData?.upgrades3m),
    downgrades3m: toNum(analystData?.downgrades3m),
    provenance: byCap.get("analyst") ? (byCap.get("analyst")?.provenance ?? []).map((p) => withStale(p, runDate)) : [],
  });

  const datasetBase: Omit<CompanyDataset, "coverage"> = {
    identity: {
      ticker,
      name: resolved.name,
      isin: resolved.isin,
      wkn: resolved.wkn,
      exchange: resolved.exchange,
      currency: resolved.currency,
      country: resolved.country,
      sector: null,
      industry: null,
      asOf: runDate,
    },
    annual,
    quarterly,
    estimates: parseEstimates(byCap.get("estimates") ?? null, runDate),
    earningsHistory,
    prices: {
      currency: typeof pricesData?.currency === "string" ? pricesData.currency : null,
      daily: Array.isArray(pricesData?.daily)
        ? (pricesData.daily as Array<Record<string, unknown>>)
            .map((p) => ({
              date: typeof p.date === "string" ? p.date : runDate,
              close: toNum(p.close) ?? NaN,
              volume: toNum(p.volume),
            }))
            .filter((p) => Number.isFinite(p.close))
        : [],
      provenance: pricesProv,
    },
    ownership,
    insiderTransactions,
    shortInterest,
    segments,
    saas,
    analyst,
    newsSentiment,
  };

  const coverage = parseCoverage(datasetBase);
  const dataset = CompanyDatasetSchema.parse({ ...datasetBase, coverage });

  const capabilityDiagnostics: CapabilityFetchDiagnostic[] = capabilities.map((cap) => {
    const d = diagnosticsByCap.get(cap);
    if (d) return d;
    return {
      capability: cap,
      status: "fetch_failed",
      providerTried: [],
      providerUsed: null,
      retries: 0,
      errors: ["unhandled capability failure"],
    };
  });

  const incompleteDueToTechnicalFailure = capabilityDiagnostics.some(
    (d) => d.status === "fetch_failed" || d.status === "rate_limited",
  );

  return {
    dataset,
    diagnostics: {
      capabilities: capabilityDiagnostics,
      incompleteDueToTechnicalFailure,
      retryRecommended: incompleteDueToTechnicalFailure,
    },
  };
}

export async function gatherMarketContext(options: GatherOptions = {}): Promise<MarketContext> {
  const detailed = await gatherMarketContextDetailed(options);
  return detailed.dataset;
}

export async function gatherMarketContextDetailed(
  options: GatherOptions = {},
): Promise<{ dataset: MarketContext; diagnostics: GatherDiagnostics }> {
  const runDate = options.asOf ?? new Date().toISOString().slice(0, 10);
  const runId = options.runId ?? makeRunId();
  const providers = options.providers ?? activeProvidersV2();

  const ctx: ProviderContext = {
    ticker: "SPY",
    runDate,
    runId,
  };

  const { result: macroResult, diagnostic } = await fetchWithFallback("macro", providers, ctx);
  if (macroResult) {
    persistRaw("MARKET", runId, "macro", macroResult);
  }

  const data = (macroResult?.data as Record<string, unknown> | undefined) ?? {};
  const provenance = macroResult ? macroResult.provenance.map((p) => withStale(p, runDate)) : [];

  const dataset = MarketContextSchema.parse({
    asOf: typeof data.asOf === "string" ? data.asOf : runDate,
    indexVsMa200Pct: toNum(data.indexVsMa200Pct),
    breadthPctAboveMa200: toNum(data.breadthPctAboveMa200),
    vix: toNum(data.vix),
    vixPercentile1y: toNum(data.vixPercentile1y),
    highYieldSpread: toNum(data.highYieldSpread),
    yieldCurve10y2y: toNum(data.yieldCurve10y2y),
    regime: null,
    provenance,
  });

  return {
    dataset,
    diagnostics: {
      capabilities: [diagnostic],
      incompleteDueToTechnicalFailure: diagnostic.status === "fetch_failed" || diagnostic.status === "rate_limited",
      retryRecommended: diagnostic.status === "fetch_failed" || diagnostic.status === "rate_limited",
    },
  };
}

export function providerMatrixForCapability(capability: Capability, providers?: DataProviderV2[]): string[] {
  const list = providers ?? activeProvidersV2();
  return list
    .filter((p) => p.available() && p.capabilities.includes(capability))
    .sort(
      (a, b) =>
        (a.priorityByCapability[capability] ?? Number.MAX_SAFE_INTEGER) -
        (b.priorityByCapability[capability] ?? Number.MAX_SAFE_INTEGER),
    )
    .map((p) => p.name);
}

export function defaultProvidersForCapability(capability: Capability): DataProviderV2[] {
  return providersForCapability(capability);
}
