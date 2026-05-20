/**
 * Yahoo Finance Adapter (yahoo-finance2).
 * Liefert: Quote, Summary (financialData, defaultKeyStatistics, summaryDetail), Earnings.
 * Klasse B (etablierte Finanz-API).
 */
import yahooFinance from "yahoo-finance2";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";

// yahoo-finance2 v3 zeigt Notices; via setGlobalConfig stumm schalten
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
