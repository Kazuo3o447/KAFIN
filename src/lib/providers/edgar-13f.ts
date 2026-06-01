import { throttledFetch } from "@/lib/providers/throttle";
import type { DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

const UA = process.env.EDGAR_USER_AGENT || "Kafin Research (kafin@local)";
const TICKER_INDEX_URL = "https://www.sec.gov/files/company_tickers.json";

let tickerMapCache: Map<string, string> | null = null;

async function tickerMap(): Promise<Map<string, string>> {
  if (tickerMapCache) return tickerMapCache;
  const res = await throttledFetch(
    TICKER_INDEX_URL,
    { headers: { "User-Agent": UA, Accept: "application/json" } },
    { ratePerSec: 8 },
  );
  if (!res.ok) throw new Error(`ticker index http ${res.status}`);
  const json = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  const out = new Map<string, string>();
  for (const k of Object.keys(json)) {
    const row = json[k];
    if (!row) continue;
    out.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  tickerMapCache = out;
  return out;
}

interface Submissions {
  filings?: { recent?: { form?: string[]; filingDate?: string[] } };
}

function trendFromChange(changePp: number | null): "accumulating" | "distributing" | "flat" | null {
  if (changePp === null) return null;
  if (changePp > 0.25) return "accumulating";
  if (changePp < -0.25) return "distributing";
  return "flat";
}

export const edgar13FProviderV2: DataProviderV2 = {
  name: "edgar-13f",
  capabilities: ["institutional"],
  available: () => true,
  priorityByCapability: {
    institutional: 1,
  },
  async fetch(cap: "institutional", ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    if (cap !== "institutional") {
      return {
        provider: "edgar-13f",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "unsupported_capability",
        durationMs: Date.now() - start,
      };
    }

    try {
      const map = await tickerMap();
      const cik = map.get(ctx.ticker.toUpperCase());
      if (!cik) {
        return {
          provider: "edgar-13f",
          capability: "institutional",
          ok: true,
          data: {
            institutionalPctHeld: null,
            institutionalQoqChangePp: null,
            institutionalTrend: null,
          },
          provenance: [],
          raw: [],
          durationMs: Date.now() - start,
        };
      }

      const res = await throttledFetch(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        { headers: { "User-Agent": UA, Accept: "application/json" } },
        { ratePerSec: 8 },
      );
      if (!res.ok) throw new Error(`submissions http ${res.status}`);
      const subs = (await res.json()) as Submissions;
      const forms = subs.filings?.recent?.form ?? [];
      const filingDates = subs.filings?.recent?.filingDate ?? [];
      const mostRecent13fIdx = forms.findIndex((f) => f === "13F-HR" || f === "13F-HR/A");

      const asOf = mostRecent13fIdx >= 0 ? (filingDates[mostRecent13fIdx] ?? null) : null;
      // EDGAR owner-submissions do not expose per-issuer institutional holding percentages directly.
      // We keep values null and provide provenance/asOf for traceability.
      const institutionalQoqChangePp = null;

      return {
        provider: "edgar-13f",
        capability: "institutional",
        ok: true,
        data: {
          institutionalPctHeld: null,
          institutionalQoqChangePp,
          institutionalTrend: trendFromChange(institutionalQoqChangePp),
          asOf,
        },
        provenance: [
          {
            source: "edgar-13f",
            url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(ctx.ticker)}&owner=exclude&type=13F-HR`,
            klass: "A",
            asOf,
            stale: false,
          },
        ],
        raw: [
          {
            name: "edgar_13f_submissions.json",
            contentType: "application/json",
            data: subs,
          },
        ],
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: "edgar-13f",
        capability: "institutional",
        ok: false,
        data: {
          institutionalPctHeld: null,
          institutionalQoqChangePp: null,
          institutionalTrend: null,
        },
        provenance: [],
        raw: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  },
};
