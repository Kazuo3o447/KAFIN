import { throttledFetch } from "@/lib/providers/throttle";
import { readSecretFromEnvOrSettings } from "@/lib/providers/settings";
import type { Capability, DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

const BASE = "https://finnhub.io/api/v1";

function finnhubKey(): string {
  return readSecretFromEnvOrSettings("FINNHUB_API_KEY", "finnhub_api_key");
}

function roleFromFinnhub(position: unknown): "CEO" | "CFO" | "director" | "officer" | "other" {
  const p = typeof position === "string" ? position.toUpperCase() : "";
  if (p.includes("CEO") || p.includes("CHIEF EXECUTIVE")) return "CEO";
  if (p.includes("CFO") || p.includes("CHIEF FINANCIAL")) return "CFO";
  if (p.includes("DIRECTOR")) return "director";
  if (p.includes("OFFICER") || p.includes("PRESIDENT") || p.includes("VP")) return "officer";
  return "other";
}

function trendFromDiff(diff: number | null): "rising" | "falling" | "flat" | null {
  if (diff === null) return null;
  if (diff > 0.5) return "rising";
  if (diff < -0.5) return "falling";
  return "flat";
}

function buildUrl(path: string, symbol: string, key: string): string {
  return `${BASE}${path}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await throttledFetch(url, { headers: { Accept: "application/json" } }, { ratePerSec: 3 });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

function makeResult(
  cap: Capability,
  start: number,
  ok: boolean,
  data: unknown,
  rawName: string,
  rawData: unknown,
  error?: string,
): ProviderFetchResultV2 {
  return {
    provider: "finnhub",
    capability: cap,
    ok,
    data,
    provenance: [],
    raw: [
      {
        name: rawName,
        contentType: "application/json",
        data: (rawData ?? {}) as object,
      },
    ],
    error,
    durationMs: Date.now() - start,
  };
}

export const finnhubProviderV2: DataProviderV2 = {
  name: "finnhub",
  capabilities: ["estimates", "earnings_history", "insider", "short_interest", "analyst", "institutional"],
  available: () => Boolean(finnhubKey()),
  priorityByCapability: {
    estimates: 1,
    earnings_history: 1,
    insider: 2,
    short_interest: 2,
    analyst: 2,
    institutional: 2,
  },
  async fetch(cap, ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    const key = finnhubKey();
    if (!key) {
      return {
        provider: "finnhub",
        capability: cap,
        ok: false,
        data: null,
        provenance: [],
        raw: [],
        error: "FINNHUB_API_KEY missing",
        durationMs: Date.now() - start,
      };
    }

    try {
      if (cap === "estimates") {
        interface FinnhubEstimateRow {
          period: string;
          revenueAvg?: number;
          ebitAvg?: number;
          epsAvg?: number;
        }
        const raw = await fetchJson<{ data?: FinnhubEstimateRow[] }>(buildUrl("/stock/estimate", ctx.ticker, key));
        const rows = (raw.data ?? [])
          .filter((r) => typeof r.period === "string")
          .map((r) => ({
            year: Number(String(r.period).slice(0, 4)),
            revenue: typeof r.revenueAvg === "number" ? r.revenueAvg : null,
            ebit: typeof r.ebitAvg === "number" ? r.ebitAvg : null,
            eps: typeof r.epsAvg === "number" ? r.epsAvg : null,
          }))
          .filter((r) => Number.isFinite(r.year))
          .sort((a, b) => a.year - b.year)
          .slice(0, 5);

        return makeResult(
          cap,
          start,
          true,
          {
            revenueFwd: rows.map((r) => ({ year: r.year, value: r.revenue })),
            ebitFwd: rows.map((r) => ({ year: r.year, value: r.ebit })),
            epsFwd: rows.map((r) => ({ year: r.year, value: r.eps })),
          },
          "finnhub_estimates.json",
          raw,
        );
      }

      if (cap === "earnings_history") {
        interface FinnhubEarningsRow {
          period: string;
          actual?: number;
          estimate?: number;
          surprisePercent?: number;
          revenueActual?: number;
          revenueEstimate?: number;
        }
        const raw = await fetchJson<FinnhubEarningsRow[]>(buildUrl("/stock/earnings", ctx.ticker, key));
        const data = raw
          .filter((r) => typeof r.period === "string")
          .slice(0, 12)
          .map((r) => ({
            date: r.period,
            epsActual: typeof r.actual === "number" ? r.actual : null,
            epsEstimate: typeof r.estimate === "number" ? r.estimate : null,
            surprisePct: typeof r.surprisePercent === "number" ? r.surprisePercent : null,
            revenueActual: typeof r.revenueActual === "number" ? r.revenueActual : null,
            revenueEstimate: typeof r.revenueEstimate === "number" ? r.revenueEstimate : null,
            revenueSurprisePct:
              typeof r.revenueActual === "number" && typeof r.revenueEstimate === "number" && r.revenueEstimate !== 0
                ? ((r.revenueActual - r.revenueEstimate) / Math.abs(r.revenueEstimate)) * 100
                : null,
          }))
          .reverse();
        return makeResult(cap, start, true, data, "finnhub_earnings_history.json", raw);
      }

      if (cap === "insider") {
        interface FinnhubInsiderRow {
          transactionDate?: string;
          name?: string;
          share?: number;
          transactionPrice?: number;
          transactionCode?: string;
          position?: string;
        }
        const raw = await fetchJson<{ data?: FinnhubInsiderRow[] }>(buildUrl("/stock/insider-transactions", ctx.ticker, key));
        const rows = (raw.data ?? []).slice(0, 100).map((r) => {
          const shares = typeof r.share === "number" ? r.share : null;
          const price = typeof r.transactionPrice === "number" ? r.transactionPrice : null;
          const txCode = typeof r.transactionCode === "string" ? r.transactionCode.toUpperCase() : "";
          return {
            date: r.transactionDate ?? ctx.runDate,
            insiderName: r.name ?? "Unknown",
            role: roleFromFinnhub(r.position),
            type: txCode === "P" ? "buy" : "sell",
            valueUsd: shares !== null && price !== null ? shares * price : null,
            shares,
            isOpenMarket: txCode === "P" || txCode === "S",
          };
        });
        return makeResult(cap, start, true, rows, "finnhub_insider.json", raw);
      }

      if (cap === "short_interest") {
        interface FinnhubShortRow {
          date: string;
          shortInterest?: number;
          shortRatio?: number;
        }
        const raw = await fetchJson<{ data?: FinnhubShortRow[] }>(buildUrl("/stock/short-interest", ctx.ticker, key));
        const rows = (raw.data ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
        const last = rows[rows.length - 1];
        const prev = rows.length > 1 ? rows[rows.length - 2] : undefined;
        const diff =
          typeof last?.shortInterest === "number" && typeof prev?.shortInterest === "number"
            ? last.shortInterest - prev.shortInterest
            : null;

        return makeResult(
          cap,
          start,
          true,
          {
            sharesShort: typeof last?.shortInterest === "number" ? last.shortInterest : null,
            daysToCover: typeof last?.shortRatio === "number" ? last.shortRatio : null,
            pctOfFloat: null,
            trend: trendFromDiff(diff),
            asOf: last?.date ?? null,
          },
          "finnhub_short_interest.json",
          raw,
        );
      }

      if (cap === "analyst") {
        interface RecommendationRow {
          buy?: number;
          hold?: number;
          sell?: number;
          strongBuy?: number;
          strongSell?: number;
          period?: string;
        }
        const rec = await fetchJson<RecommendationRow[]>(buildUrl("/stock/recommendation", ctx.ticker, key));
        const target = await fetchJson<Record<string, unknown>>(buildUrl("/stock/price-target", ctx.ticker, key));
        const last = rec[0] ?? {};
        const count =
          (typeof last.buy === "number" ? last.buy : 0) +
          (typeof last.hold === "number" ? last.hold : 0) +
          (typeof last.sell === "number" ? last.sell : 0) +
          (typeof last.strongBuy === "number" ? last.strongBuy : 0) +
          (typeof last.strongSell === "number" ? last.strongSell : 0);
        const denominator = count > 0 ? count : null;
        const recommendationMean =
          denominator === null
            ? null
            : ((1 * (last.strongBuy ?? 0) + 2 * (last.buy ?? 0) + 3 * (last.hold ?? 0) + 4 * (last.sell ?? 0) + 5 * (last.strongSell ?? 0)) /
                denominator);

        return {
          provider: "finnhub",
          capability: cap,
          ok: true,
          data: {
            count,
            recommendationMean,
            targetMean: typeof target.targetMean === "number" ? target.targetMean : null,
            targetHigh: typeof target.targetHigh === "number" ? target.targetHigh : null,
            targetLow: typeof target.targetLow === "number" ? target.targetLow : null,
            upgrades3m: null,
            downgrades3m: null,
          },
          provenance: [],
          raw: [
            { name: "finnhub_recommendation.json", contentType: "application/json", data: rec },
            { name: "finnhub_price_target.json", contentType: "application/json", data: target },
          ],
          durationMs: Date.now() - start,
        };
      }

      if (cap === "institutional") {
        const raw = await fetchJson<Record<string, unknown>>(buildUrl("/stock/ownership", ctx.ticker, key));
        return makeResult(
          cap,
          start,
          true,
          {
            institutionalPctHeld: null,
            institutionalQoqChangePp: null,
            institutionalTrend: null,
            asOf: null,
          },
          "finnhub_ownership.json",
          raw,
        );
      }

      return {
        provider: "finnhub",
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
        provider: "finnhub",
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
