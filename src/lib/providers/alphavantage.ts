/**
 * Alpha Vantage Adapter (optional).
 * Aktiv nur wenn `ALPHA_VANTAGE_API_KEY` gesetzt ist.
 * Free-Tier: 5 req/min – wir throtteln auf ~0.08 req/s.
 * Klasse B.
 */
import { throttledFetch } from "./throttle";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";

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
