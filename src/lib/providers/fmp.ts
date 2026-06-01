/**
 * Financial Modeling Prep Adapter (optional).
 * Aktiv nur wenn `FMP_API_KEY` gesetzt ist.
 * Klasse B.
 */
import { throttledFetch } from "./throttle";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";
import type { Capability, DataProviderV2, ProviderFetchResultV2 } from "./types";

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

async function fetchFmpJson(path: string, apikey: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}apikey=${apikey}`;
  const res = await throttledFetch(url, { headers: { Accept: "application/json" } }, { ratePerSec: 4 });
  if (!res.ok) throw new Error(`fmp_http_${res.status}`);
  return await res.json();
}

export const fmpProviderV2: DataProviderV2 = {
  name: "fmp",
  capabilities: ["fundamentals_annual", "fundamentals_quarterly", "estimates", "analyst"],
  available: () => Boolean(process.env.FMP_API_KEY),
  priorityByCapability: {
    fundamentals_annual: 3,
    fundamentals_quarterly: 3,
    estimates: 2,
    analyst: 3,
  },
  async fetch(cap: Capability, ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    const apikey = process.env.FMP_API_KEY;
    if (!apikey) {
      return {
        provider: "fmp",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "FMP_API_KEY missing",
        durationMs: Date.now() - start,
      };
    }

    const ticker = encodeURIComponent(ctx.ticker);
    try {
      if (cap === "fundamentals_annual") {
        const [income, balance, cashflow] = await Promise.all([
          fetchFmpJson(`/income-statement/${ticker}?period=annual&limit=20`, apikey),
          fetchFmpJson(`/balance-sheet-statement/${ticker}?period=annual&limit=20`, apikey),
          fetchFmpJson(`/cash-flow-statement/${ticker}?period=annual&limit=20`, apikey),
        ]);
        return {
          provider: "fmp",
          capability: cap,
          ok: true,
          data: { income, balance, cashflow },
          provenance: [{ source: "fmp", url: `https://site.financialmodelingprep.com/financial-statements/${ticker}`, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "fmp_fundamentals_annual.json", contentType: "application/json", data: { income, balance, cashflow } }],
          durationMs: Date.now() - start,
        };
      }
      if (cap === "fundamentals_quarterly") {
        const [income, balance, cashflow] = await Promise.all([
          fetchFmpJson(`/income-statement/${ticker}?period=quarter&limit=24`, apikey),
          fetchFmpJson(`/balance-sheet-statement/${ticker}?period=quarter&limit=24`, apikey),
          fetchFmpJson(`/cash-flow-statement/${ticker}?period=quarter&limit=24`, apikey),
        ]);
        return {
          provider: "fmp",
          capability: cap,
          ok: true,
          data: { income, balance, cashflow },
          provenance: [{ source: "fmp", url: `https://site.financialmodelingprep.com/financial-statements/${ticker}`, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "fmp_fundamentals_quarterly.json", contentType: "application/json", data: { income, balance, cashflow } }],
          durationMs: Date.now() - start,
        };
      }
      if (cap === "estimates") {
        const est = await fetchFmpJson(`/analyst-estimates/${ticker}?limit=10`, apikey);
        return {
          provider: "fmp",
          capability: cap,
          ok: true,
          data: est,
          provenance: [{ source: "fmp", url: `https://site.financialmodelingprep.com/financial-statements/${ticker}`, klass: "B-", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "fmp_estimates.json", contentType: "application/json", data: est as object }],
          durationMs: Date.now() - start,
        };
      }
      if (cap === "analyst") {
        const target = await fetchFmpJson(`/price-target-consensus?symbol=${ticker}`, apikey);
        return {
          provider: "fmp",
          capability: cap,
          ok: true,
          data: target,
          provenance: [{ source: "fmp", url: `https://site.financialmodelingprep.com/financial-statements/${ticker}`, klass: "B-", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "fmp_analyst.json", contentType: "application/json", data: target as object }],
          durationMs: Date.now() - start,
        };
      }
      return {
        provider: "fmp",
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
        provider: "fmp",
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
