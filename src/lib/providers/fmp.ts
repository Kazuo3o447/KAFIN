/**
 * Financial Modeling Prep Adapter (optional).
 * Aktiv nur wenn `FMP_API_KEY` gesetzt ist.
 * Klasse B.
 */
import { throttledFetch } from "./throttle";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";

const BASE = "https://financialmodelingprep.com/api/v3";

export const fmpProvider: DataProvider = {
  name: "fmp",
  available: () => Boolean(process.env.FMP_API_KEY),

  async fetch(ctx: ProviderContext): Promise<ProviderResult> {
    const start = Date.now();
    const log = ctx.log ?? (() => {});
    const facts: ProviderFact[] = [];
    const raw: ProviderResult["raw"] = [];
    const apikey = process.env.FMP_API_KEY;

    if (!apikey) {
      return {
        provider: "fmp",
        ok: false,
        facts,
        raw,
        error: "FMP_API_KEY missing",
        durationMs: Date.now() - start,
      };
    }

    const T = encodeURIComponent(ctx.ticker);
    const profileUrl = `https://site.financialmodelingprep.com/financial-statements/${T}`;

    const endpoints: Array<{ path: string; key: string }> = [
      { path: `/profile/${T}`, key: "profile" },
      { path: `/income-statement/${T}?limit=4`, key: "income_statement_q" },
      { path: `/balance-sheet-statement/${T}?limit=4`, key: "balance_sheet_q" },
      { path: `/cash-flow-statement/${T}?limit=4`, key: "cashflow_q" },
      { path: `/key-metrics-ttm/${T}`, key: "key_metrics_ttm" },
      { path: `/ratios-ttm/${T}`, key: "ratios_ttm" },
      { path: `/analyst-estimates/${T}?limit=2`, key: "analyst_estimates" },
    ];

    try {
      for (const ep of endpoints) {
        const sep = ep.path.includes("?") ? "&" : "?";
        const url = `${BASE}${ep.path}${sep}apikey=${apikey}`;
        const res = await throttledFetch(url, { headers: { Accept: "application/json" } }, { ratePerSec: 4 });
        if (!res.ok) {
          log(`fmp: ${ep.key} HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        raw.push({
          name: `fmp_${ep.key}.json`,
          contentType: "application/json",
          data: data as object,
        });
        facts.push({
          field: `fmp_${ep.key}`,
          value: data,
          url: profileUrl,
          title: `FMP ${ep.key}`,
          klass: "B",
        });
      }
      log(`fmp: ${facts.length} dataset facts collected`);
      return { provider: "fmp", ok: true, facts, raw, durationMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`fmp: ERROR ${msg}`);
      return { provider: "fmp", ok: false, facts, raw, error: msg, durationMs: Date.now() - start };
    }
  },
};
