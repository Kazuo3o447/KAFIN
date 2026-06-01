import { readSecretFromEnvOrSettings } from "@/lib/providers/settings";
import { throttledFetch } from "@/lib/providers/throttle";
import type { DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

const BASE = "https://api.stlouisfed.org/fred/series/observations";

function fredKey(): string {
  return readSecretFromEnvOrSettings("FRED_API_KEY", "fred_api_key");
}

async function fetchSeries(seriesId: string, key: string): Promise<Array<{ date: string; value: number }>> {
  const url = `${BASE}?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=asc`;
  const res = await throttledFetch(url, { headers: { Accept: "application/json" } }, { ratePerSec: 2 });
  if (!res.ok) throw new Error(`fred_${seriesId}_http_${res.status}`);
  const json = (await res.json()) as { observations?: Array<{ date: string; value: string }> };
  return (json.observations ?? [])
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value));
}

function percentileRank(values: number[], v: number): number | null {
  if (values.length === 0 || !Number.isFinite(v)) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = sorted.findIndex((x) => x >= v);
  if (idx < 0) return 100;
  return (idx / Math.max(sorted.length - 1, 1)) * 100;
}

export const fredProviderV2: DataProviderV2 = {
  name: "fred",
  capabilities: ["macro"],
  available: () => Boolean(fredKey()),
  priorityByCapability: {
    macro: 1,
  },
  async fetch(cap: "macro", ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    if (cap !== "macro") {
      return {
        provider: "fred",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "unsupported_capability",
        durationMs: Date.now() - start,
      };
    }

    const key = fredKey();
    if (!key) {
      return {
        provider: "fred",
        capability: "macro",
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "FRED_API_KEY missing",
        durationMs: Date.now() - start,
      };
    }

    try {
      const [hy, yc, vix] = await Promise.all([
        fetchSeries("BAMLH0A0HYM2", key),
        fetchSeries("T10Y2Y", key),
        fetchSeries("VIXCLS", key),
      ]);

      const hyLast = hy[hy.length - 1] ?? null;
      const ycLast = yc[yc.length - 1] ?? null;
      const vixLast = vix[vix.length - 1] ?? null;
      const vix1y = vix.slice(-252).map((x) => x.value);

      return {
        provider: "fred",
        capability: "macro",
        ok: true,
        data: {
          highYieldSpread: hyLast?.value ?? null,
          yieldCurve10y2y: ycLast?.value ?? null,
          vix: vixLast?.value ?? null,
          vixPercentile1y: vixLast ? percentileRank(vix1y, vixLast.value) : null,
          asOf: [hyLast?.date, ycLast?.date, vixLast?.date].filter(Boolean).sort().at(-1) ?? ctx.runDate,
        },
        provenance: [
          {
            source: "fred",
            url: "https://fred.stlouisfed.org/",
            klass: "A-",
            asOf: [hyLast?.date, ycLast?.date, vixLast?.date].filter(Boolean).sort().at(-1) ?? null,
            stale: false,
          },
        ],
        raw: [
          { name: "fred_hy_spread.json", contentType: "application/json", data: hy },
          { name: "fred_yield_curve_10y2y.json", contentType: "application/json", data: yc },
          { name: "fred_vix.json", contentType: "application/json", data: vix },
        ],
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: "fred",
        capability: "macro",
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
