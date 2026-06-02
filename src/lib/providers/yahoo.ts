/**
 * Yahoo Finance Adapter (yahoo-finance2).
 * Liefert: Quote, Summary (financialData, defaultKeyStatistics, summaryDetail), Earnings.
 * Klasse B (etablierte Finanz-API).
 */
import YahooFinance from "yahoo-finance2";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";
import type { Capability, DataProviderV2, ProviderFetchResultV2 } from "./types";

// yahoo-finance2 v3 zeigt Notices; via setGlobalConfig stumm schalten
const yahooFinance = new YahooFinance();
try {
  (yahooFinance as unknown as { setGlobalConfig?: (cfg: object) => void }).setGlobalConfig?.({
    notifyRipHistorical: "silent",
  });
} catch {
  /* noop */
}

const URL_QUOTE = (t: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`;

export const yahooProvider: DataProvider = {
  name: "yahoo",
  available: () => true,

  async fetch(ctx: ProviderContext): Promise<ProviderResult> {
    const start = Date.now();
    const log = ctx.log ?? (() => {});
    const facts: ProviderFact[] = [];
    const raw: ProviderResult["raw"] = [];
    const url = URL_QUOTE(ctx.ticker);

    try {
      log(`yahoo: fetching quote+summary for ${ctx.ticker}`);

      const quoteRaw = await yahooFinance.quote(ctx.ticker, {}, { validateResult: false });
      const quote = quoteRaw as Record<string, unknown> | undefined;
      raw.push({ name: "yahoo_quote.json", contentType: "application/json", data: quote ?? {} });

      const modules = [
        "financialData",
        "defaultKeyStatistics",
        "summaryDetail",
        "summaryProfile",
        "price",
        "earnings",
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
      ] as const;
      const summaryRaw = await yahooFinance.quoteSummary(
        ctx.ticker,
        { modules: [...modules] },
        { validateResult: false },
      );
      const summary = summaryRaw as Record<string, Record<string, unknown> | undefined> | undefined;
      raw.push({ name: "yahoo_summary.json", contentType: "application/json", data: summary ?? {} });

      const push = (field: string, value: unknown, asOf?: string): void => {
        if (value === undefined || value === null) return;
        if (typeof value === "number" && !Number.isFinite(value)) return;
        facts.push({ field, value, url, title: `Yahoo Finance · ${ctx.ticker}`, asOf, klass: "B" });
      };

      const q = (quote ?? {}) as Record<string, unknown>;
      // Quote-Level
      push("price", q.regularMarketPrice);
      push("currency", q.currency);
      push("exchange", q.fullExchangeName);
      push("market_cap", q.marketCap);
      push("shares_outstanding", q.sharesOutstanding);
      push("trailing_pe", q.trailingPE);
      push("forward_pe", q.forwardPE);
      push("price_to_book", q.priceToBook);
      push("beta", q.beta);
      push("fifty_two_week_high", q.fiftyTwoWeekHigh);
      push("fifty_two_week_low", q.fiftyTwoWeekLow);

      // Profile / Industry
      const prof = (summary?.summaryProfile ?? {}) as Record<string, unknown>;
      push("sector", prof.sector);
      push("industry", prof.industry);
      push("country", prof.country);
      push("website", prof.website);
      push("long_business_summary", prof.longBusinessSummary);

      // Financial Data
      const fin = (summary?.financialData ?? {}) as Record<string, unknown>;
      push("revenue_ttm", fin.totalRevenue);
      push("gross_margin", fin.grossMargins);
      push("operating_margin", fin.operatingMargins);
      push("profit_margin", fin.profitMargins);
      push("ebitda", fin.ebitda);
      push("free_cashflow", fin.freeCashflow);
      push("operating_cashflow", fin.operatingCashflow);
      push("revenue_growth_yoy", fin.revenueGrowth);
      push("earnings_growth_yoy", fin.earningsGrowth);
      push("total_cash", fin.totalCash);
      push("total_debt", fin.totalDebt);
      push("debt_to_equity", fin.debtToEquity);
      push("current_ratio", fin.currentRatio);
      push("recommendation_mean", fin.recommendationMean);
      push("number_of_analyst_opinions", fin.numberOfAnalystOpinions);
      push("target_mean_price", fin.targetMeanPrice);

      // Default Key Statistics
      const stats = (summary?.defaultKeyStatistics ?? {}) as Record<string, unknown>;
      push("enterprise_value", stats.enterpriseValue);
      push("ev_to_revenue", stats.enterpriseToRevenue);
      push("ev_to_ebitda", stats.enterpriseToEbitda);
      push("forward_eps", stats.forwardEps);
      push("trailing_eps", stats.trailingEps);
      push("peg_ratio", stats.pegRatio);
      push("short_ratio", stats.shortRatio);
      push("short_percent_of_float", stats.shortPercentOfFloat);
      push("held_percent_insiders", stats.heldPercentInsiders);
      push("held_percent_institutions", stats.heldPercentInstitutions);

      // Earnings (Quartalshistorie)
      const earnings = (summary?.earnings ?? {}) as {
        financialsChart?: { quarterly?: unknown };
        earningsChart?: { quarterly?: unknown };
      };
      if (earnings.financialsChart?.quarterly) {
        push("earnings_quarterly", earnings.financialsChart.quarterly);
      }
      if (earnings.earningsChart?.quarterly) {
        push("eps_quarterly", earnings.earningsChart.quarterly);
      }

      log(`yahoo: ${facts.length} facts extracted`);
      return {
        provider: "yahoo",
        ok: true,
        facts,
        raw,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`yahoo: ERROR ${msg}`);
      return { provider: "yahoo", ok: false, facts, raw, error: msg, durationMs: Date.now() - start };
    }
  },
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function extractSummary<T extends Record<string, unknown>>(summary: Record<string, unknown> | undefined, key: string): T {
  const rec = summary?.[key];
  return (typeof rec === "object" && rec !== null ? rec : {}) as T;
}

export const yahooProviderV2: DataProviderV2 = {
  name: "yahoo",
  capabilities: [
    "fundamentals_annual",
    "fundamentals_quarterly",
    "prices",
    "short_interest",
    "analyst",
    "institutional",
    "segments",
    "symbol_resolution",
    "macro",
  ],
  available: () => true,
  priorityByCapability: {
    fundamentals_annual: 2,
    fundamentals_quarterly: 2,
    prices: 1,
    short_interest: 1,
    analyst: 1,
    institutional: 3,
    segments: 2,
    symbol_resolution: 3,
    macro: 2,
  },
  async fetch(cap: Capability, ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    const baseUrl = URL_QUOTE(ctx.ticker);
    try {
      if (cap === "prices") {
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 4);
        const period2 = new Date();
        const history = (await yahooFinance.historical(ctx.ticker, {
          period1,
          period2,
          interval: "1d",
        })) as Array<{ date: Date; close?: number; volume?: number }>;
        const quoteRaw = await yahooFinance.quote(ctx.ticker, {}, { validateResult: false });
        const quote = quoteRaw as Record<string, unknown>;
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: {
            currency: typeof quote.currency === "string" ? quote.currency : null,
            daily: history
              .filter((d) => typeof d.close === "number")
              .map((d) => ({
                date: d.date.toISOString().slice(0, 10),
                close: d.close as number,
                volume: typeof d.volume === "number" ? d.volume : null,
              })),
          },
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_prices.json", contentType: "application/json", data: history }],
          durationMs: Date.now() - start,
        };
      }

      const modules = [
        "financialData",
        "defaultKeyStatistics",
        "summaryDetail",
        "summaryProfile",
        "price",
        "earnings",
        "incomeStatementHistory",
        "incomeStatementHistoryQuarterly",
        "balanceSheetHistory",
        "balanceSheetHistoryQuarterly",
        "cashflowStatementHistory",
        "cashflowStatementHistoryQuarterly",
      ] as const;
      const summaryRaw = await yahooFinance.quoteSummary(
        ctx.ticker,
        { modules: [...modules] },
        { validateResult: false },
      );
      const summary = summaryRaw as Record<string, unknown>;

      if (cap === "fundamentals_annual" || cap === "fundamentals_quarterly") {
        const isQuarterly = cap === "fundamentals_quarterly";
        const income = extractSummary<Record<string, unknown>>(summary, isQuarterly ? "incomeStatementHistoryQuarterly" : "incomeStatementHistory");
        const balance = extractSummary<Record<string, unknown>>(summary, isQuarterly ? "balanceSheetHistoryQuarterly" : "balanceSheetHistory");
        const cashflow = extractSummary<Record<string, unknown>>(summary, isQuarterly ? "cashflowStatementHistoryQuarterly" : "cashflowStatementHistory");

        const incomeRows = Array.isArray(income.incomeStatementHistory)
          ? (income.incomeStatementHistory as Array<Record<string, unknown>>)
          : [];
        const balanceRows = Array.isArray(balance.balanceSheetStatements)
          ? (balance.balanceSheetStatements as Array<Record<string, unknown>>)
          : [];
        const cashRows = Array.isArray(cashflow.cashflowStatements)
          ? (cashflow.cashflowStatements as Array<Record<string, unknown>>)
          : [];

        const byDate = new Map<string, Record<string, unknown>>();
        for (const row of incomeRows) {
          const date = typeof row.endDate === "string" ? row.endDate : typeof row.endDate === "object" && row.endDate && typeof (row.endDate as Record<string, unknown>).fmt === "string" ? String((row.endDate as Record<string, unknown>).fmt) : null;
          if (!date) continue;
          byDate.set(date, {
            periodEnd: date,
            revenue: num(row.totalRevenue),
            grossProfit: num(row.grossProfit),
            ebit: num(row.operatingIncome),
            ebitda: num(row.ebitda),
            netIncome: num(row.netIncome),
            interestExpense: num(row.interestExpense),
            researchAndDevelopment: num(row.researchDevelopment),
            stockBasedComp: num(row.stockBasedCompensation),
            sharesDiluted: num(row.dilutedAverageShares),
            dividendPerShare: num(row.dividendPerShare),
          });
        }
        for (const row of balanceRows) {
          const date = typeof row.endDate === "string" ? row.endDate : typeof row.endDate === "object" && row.endDate && typeof (row.endDate as Record<string, unknown>).fmt === "string" ? String((row.endDate as Record<string, unknown>).fmt) : null;
          if (!date) continue;
          const prev = byDate.get(date) ?? { periodEnd: date };
          byDate.set(date, {
            ...prev,
            totalDebt: num(row.totalDebt),
            cashAndEquivalents: num(row.cash),
            totalEquity: num(row.stockholdersEquity),
            totalAssets: num(row.totalAssets),
            inventory: num(row.inventory),
            accountsReceivable: num(row.netReceivables),
          });
        }
        for (const row of cashRows) {
          const date = typeof row.endDate === "string" ? row.endDate : typeof row.endDate === "object" && row.endDate && typeof (row.endDate as Record<string, unknown>).fmt === "string" ? String((row.endDate as Record<string, unknown>).fmt) : null;
          if (!date) continue;
          const prev = byDate.get(date) ?? { periodEnd: date };
          const ocf = num(row.totalCashFromOperatingActivities);
          const capex = num(row.capitalExpenditures);
          byDate.set(date, {
            ...prev,
            operatingCashflow: ocf,
            capex,
            freeCashflow: ocf !== null && capex !== null ? ocf + capex : null,
            shareRepurchases: num(row.repurchaseOfStock),
          });
        }

        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: Array.from(byDate.values()).sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd))),
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: `yahoo_${cap}.json`, contentType: "application/json", data: { income, balance, cashflow } }],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "short_interest") {
        const stats = extractSummary<Record<string, unknown>>(summary, "defaultKeyStatistics");
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: {
            pctOfFloat: num(stats.shortPercentOfFloat),
            daysToCover: num(stats.shortRatio),
            sharesShort: num(stats.sharesShort),
            trend: null,
            asOf: ctx.runDate,
          },
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_short_interest.json", contentType: "application/json", data: stats }],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "analyst") {
        const fin = extractSummary<Record<string, unknown>>(summary, "financialData");
        const detail = extractSummary<Record<string, unknown>>(summary, "summaryDetail");
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: {
            count: num(fin.numberOfAnalystOpinions),
            recommendationMean: num(fin.recommendationMean),
            targetMean: num(fin.targetMeanPrice),
            targetHigh: num(fin.targetHighPrice) ?? num(detail.targetHighPrice),
            targetLow: num(fin.targetLowPrice) ?? num(detail.targetLowPrice),
            upgrades3m: null,
            downgrades3m: null,
          },
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_analyst.json", contentType: "application/json", data: { fin, detail } }],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "institutional") {
        const stats = extractSummary<Record<string, unknown>>(summary, "defaultKeyStatistics");
        const quoteRaw = await yahooFinance.quote(ctx.ticker, {}, { validateResult: false });
        const quote = quoteRaw as Record<string, unknown>;
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: {
            institutionalPctHeld: num(stats.heldPercentInstitutions),
            institutionalQoqChangePp: null,
            institutionalTrend: null,
            insiderOwnershipPct: num(stats.heldPercentInsiders),
            sharesOutstanding: num(quote.sharesOutstanding),
            floatShares: num(stats.floatShares),
            asOf: ctx.runDate,
          },
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_ownership.json", contentType: "application/json", data: { stats, quote } }],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "segments") {
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: { segments: [], saas: null },
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_segments.json", contentType: "application/json", data: {} }],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "symbol_resolution") {
        const quoteRaw = await yahooFinance.quote(ctx.ticker, {}, { validateResult: false });
        const quote = quoteRaw as Record<string, unknown>;
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: {
            ticker: ctx.ticker.toUpperCase(),
            exchange: typeof quote.fullExchangeName === "string" ? quote.fullExchangeName : null,
            name: typeof quote.longName === "string" ? quote.longName : typeof quote.shortName === "string" ? quote.shortName : null,
            currency: typeof quote.currency === "string" ? quote.currency : null,
            country: typeof quote.region === "string" ? quote.region : null,
          },
          provenance: [{ source: "yahoo", url: baseUrl, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_symbol_resolution.json", contentType: "application/json", data: quote }],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "macro") {
        const vixRaw = await yahooFinance.quote("^VIX", {}, { validateResult: false });
        const vix = vixRaw as Record<string, unknown>;
        return {
          provider: "yahoo",
          capability: cap,
          ok: true,
          data: {
            vix: num(vix.regularMarketPrice),
            asOf: ctx.runDate,
          },
          provenance: [{ source: "yahoo", url: "https://finance.yahoo.com/quote/%5EVIX", klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "yahoo_macro.json", contentType: "application/json", data: vix }],
          durationMs: Date.now() - start,
        };
      }

      return {
        provider: "yahoo",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "unsupported_capability",
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: "yahoo",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  },
};
