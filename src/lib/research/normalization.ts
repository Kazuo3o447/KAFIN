import type { CompanyDataset, FinancialPeriod } from "@/lib/schemas/dataset";
import { CompanyDatasetSchema } from "@/lib/schemas/dataset";
import { THRESHOLDS } from "@/lib/research/thresholds";

export interface NormalizeOptions {
  reportingCurrency?: string;
  fxRates?: Record<string, number>;
  sbcAdjustmentRatio?: number;
}

export interface NormalizationResult {
  dataset: CompanyDataset;
  reportingCurrency: string;
  originalCurrency: string | null;
  fxRateUsed: number;
  ttm: {
    revenue: number | null;
    ebit: number | null;
    freeCashflow: number | null;
  };
  gaapVsAdjusted: {
    gaap: {
      freeCashflow: number | null;
    };
    adjusted: {
      freeCashflowAfterSbc: number | null;
    };
    sbcAdjustmentRatio: number;
  };
}

const MONETARY_FIELDS: Array<keyof FinancialPeriod> = [
  "revenue",
  "grossProfit",
  "ebit",
  "ebitda",
  "netIncome",
  "operatingCashflow",
  "capex",
  "freeCashflow",
  "sharesDiluted",
  "dividendPerShare",
  "totalDebt",
  "cashAndEquivalents",
  "totalEquity",
  "totalAssets",
  "interestExpense",
  "researchAndDevelopment",
  "stockBasedComp",
  "inventory",
  "accountsReceivable",
  "shareRepurchases",
];

function resolveFxRate(
  originalCurrency: string | null,
  reportingCurrency: string,
  fxRates: Record<string, number>,
  periodEnd: string,
): number {
  if (originalCurrency === null || originalCurrency === reportingCurrency) return 1;
  const pair = `${originalCurrency}_${reportingCurrency}`;
  const withAsOf = `${pair}@${periodEnd}`;
  return fxRates[withAsOf] ?? fxRates[pair] ?? THRESHOLDS.fx_default_fallback_rate;
}

function convertPeriod(period: FinancialPeriod, fxRate: number): FinancialPeriod {
  const next: FinancialPeriod = { ...period };
  for (const key of MONETARY_FIELDS) {
    const field = next[key];
    if (field && typeof field === "object" && "value" in field && typeof field.value === "number") {
      (next as Record<string, unknown>)[key] = {
        ...field,
        value: field.value * fxRate,
      };
    }
  }
  return next;
}

function sumLast4(values: Array<number | null>): number | null {
  if (values.length < 4) return null;
  const tail = values.slice(-4);
  if (tail.some((v) => v === null)) return null;
  return (tail as number[]).reduce((s, v) => s + v, 0);
}

export function normalizeDataset(dataset: CompanyDataset, options: NormalizeOptions = {}): NormalizationResult {
  const reportingCurrency = options.reportingCurrency ?? THRESHOLDS.reporting_currency_default;
  const originalCurrency = dataset.identity.currency ?? dataset.prices.currency ?? null;

  const fxMap = options.fxRates ?? {};
  const fxRateUsed = resolveFxRate(originalCurrency, reportingCurrency, fxMap, dataset.identity.asOf);

  const normalizedAnnual = dataset.annual.map((p) =>
    convertPeriod(p, resolveFxRate(originalCurrency, reportingCurrency, fxMap, p.periodEnd)),
  );
  const normalizedQuarterly = dataset.quarterly.map((p) =>
    convertPeriod(p, resolveFxRate(originalCurrency, reportingCurrency, fxMap, p.periodEnd)),
  );

  // Keep fiscal period endings as-is; build aligned TTM from the latest 4 fiscal quarters.
  const revenueTtm = sumLast4(normalizedQuarterly.map((q) => q.revenue.value));
  const ebitTtm = sumLast4(normalizedQuarterly.map((q) => q.ebit.value));
  const fcfTtm = sumLast4(normalizedQuarterly.map((q) => q.freeCashflow.value));

  const sbcTtm = sumLast4(normalizedQuarterly.map((q) => q.stockBasedComp.value));
  const sbcAdjustmentRatio = options.sbcAdjustmentRatio ?? 1;
  const freeCashflowAfterSbc =
    fcfTtm !== null && sbcTtm !== null ? fcfTtm - sbcTtm * sbcAdjustmentRatio : null;

  const normalized = CompanyDatasetSchema.parse({
    ...dataset,
    identity: {
      ...dataset.identity,
      currency: reportingCurrency,
    },
    prices: {
      ...dataset.prices,
      currency: reportingCurrency,
    },
    annual: normalizedAnnual,
    quarterly: normalizedQuarterly,
  });

  return {
    dataset: normalized,
    reportingCurrency,
    originalCurrency,
    fxRateUsed,
    ttm: {
      revenue: revenueTtm,
      ebit: ebitTtm,
      freeCashflow: fcfTtm,
    },
    gaapVsAdjusted: {
      gaap: {
        freeCashflow: fcfTtm,
      },
      adjusted: {
        freeCashflowAfterSbc,
      },
      sbcAdjustmentRatio,
    },
  };
}
