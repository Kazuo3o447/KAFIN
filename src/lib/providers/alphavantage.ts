/**
 * Alpha Vantage Adapter (optional).
 * Aktiv nur wenn `ALPHA_VANTAGE_API_KEY` gesetzt ist.
 * Free-Tier: 5 req/min – wir throtteln auf ~0.08 req/s.
 * Klasse B.
 */
import { throttledFetch } from "./throttle";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";
import type { Capability, DataProviderV2, ProviderFetchResultV2 } from "./types";

const BASE = "https://www.alphavantage.co/query";

export const alphaVantageProvider: DataProvider = {
  name: "alphavantage",
  available: () => Boolean(process.env.ALPHA_VANTAGE_API_KEY),

  async fetch(ctx: ProviderContext): Promise<ProviderResult> {
    const start = Date.now();
    const log = ctx.log ?? (() => {});
    const facts: ProviderFact[] = [];
    const raw: ProviderResult["raw"] = [];
    const key = process.env.ALPHA_VANTAGE_API_KEY;

    if (!key) {
      return {
        provider: "alphavantage",
        ok: false,
        facts,
        raw,
        error: "ALPHA_VANTAGE_API_KEY missing",
        durationMs: Date.now() - start,
      };
    }

    const profileUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ctx.ticker)}`;
    const functions = ["OVERVIEW", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "EARNINGS"];

    try {
      for (const fn of functions) {
        const url = `${BASE}?function=${fn}&symbol=${encodeURIComponent(ctx.ticker)}&apikey=${key}`;
        const res = await throttledFetch(url, { headers: { Accept: "application/json" } }, { ratePerSec: 0.1 });
        if (!res.ok) {
          log(`alphavantage: ${fn} HTTP ${res.status}`);
          continue;
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (data["Note"] || data["Information"]) {
          log(`alphavantage: ${fn} rate-limited`);
          continue;
        }
        raw.push({
          name: `alphavantage_${fn.toLowerCase()}.json`,
          contentType: "application/json",
          data,
        });
        facts.push({
          field: `av_${fn.toLowerCase()}`,
          value: data,
          url: profileUrl,
          title: `Alpha Vantage ${fn}`,
          klass: "B",
        });
      }
      log(`alphavantage: ${facts.length} datasets collected`);
      return { provider: "alphavantage", ok: true, facts, raw, durationMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`alphavantage: ERROR ${msg}`);
      return { provider: "alphavantage", ok: false, facts, raw, error: msg, durationMs: Date.now() - start };
    }
  },
};

async function fetchAv(functionName: string, symbol: string, key: string): Promise<Record<string, unknown>> {
  const url = `${BASE}?function=${functionName}&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  const res = await throttledFetch(url, { headers: { Accept: "application/json" } }, { ratePerSec: 0.1 });
  if (!res.ok) throw new Error(`alphavantage_http_${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  if (json["Note"] || json["Information"]) throw new Error("alphavantage_rate_limited");
  return json;
}

export const alphaVantageProviderV2: DataProviderV2 = {
  name: "alphavantage",
  capabilities: ["fundamentals_annual", "fundamentals_quarterly", "earnings_history"],
  available: () => Boolean(process.env.ALPHA_VANTAGE_API_KEY),
  priorityByCapability: {
    fundamentals_annual: 4,
    fundamentals_quarterly: 4,
    earnings_history: 3,
  },
  async fetch(cap: Capability, ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) {
      return {
        provider: "alphavantage",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "ALPHA_VANTAGE_API_KEY missing",
        durationMs: Date.now() - start,
      };
    }

    try {
      if (cap === "fundamentals_annual") {
        const [income, balance, cash] = await Promise.all([
          fetchAv("INCOME_STATEMENT", ctx.ticker, key),
          fetchAv("BALANCE_SHEET", ctx.ticker, key),
          fetchAv("CASH_FLOW", ctx.ticker, key),
        ]);
        return {
          provider: "alphavantage",
          capability: cap,
          ok: true,
          data: { income, balance, cash },
          provenance: [{ source: "alphavantage", url: `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ctx.ticker)}`, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "alphavantage_fundamentals_annual.json", contentType: "application/json", data: { income, balance, cash } }],
          durationMs: Date.now() - start,
        };
      }
      if (cap === "fundamentals_quarterly") {
        const [income, balance, cash] = await Promise.all([
          fetchAv("INCOME_STATEMENT", ctx.ticker, key),
          fetchAv("BALANCE_SHEET", ctx.ticker, key),
          fetchAv("CASH_FLOW", ctx.ticker, key),
        ]);
        return {
          provider: "alphavantage",
          capability: cap,
          ok: true,
          data: { income, balance, cash },
          provenance: [{ source: "alphavantage", url: `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ctx.ticker)}`, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "alphavantage_fundamentals_quarterly.json", contentType: "application/json", data: { income, balance, cash } }],
          durationMs: Date.now() - start,
        };
      }
      if (cap === "earnings_history") {
        const earnings = await fetchAv("EARNINGS", ctx.ticker, key);
        return {
          provider: "alphavantage",
          capability: cap,
          ok: true,
          data: earnings,
          provenance: [{ source: "alphavantage", url: `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(ctx.ticker)}`, klass: "B", asOf: ctx.runDate, stale: false }],
          raw: [{ name: "alphavantage_earnings.json", contentType: "application/json", data: earnings }],
          durationMs: Date.now() - start,
        };
      }
      return {
        provider: "alphavantage",
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
        provider: "alphavantage",
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
