import { fetchForm4Summary } from "@/lib/providers/edgar";
import type { DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";

function roleFromTitle(title: string): "CEO" | "CFO" | "director" | "officer" | "other" {
  const t = title.toUpperCase();
  if (t.includes("CEO") || t.includes("CHIEF EXECUTIVE")) return "CEO";
  if (t.includes("CFO") || t.includes("CHIEF FINANCIAL")) return "CFO";
  if (t.includes("DIRECTOR")) return "director";
  if (t.includes("OFFICER") || t.includes("PRESIDENT") || t.includes("VP")) return "officer";
  return "other";
}

export const edgarInsiderProviderV2: DataProviderV2 = {
  name: "edgar-insider",
  capabilities: ["insider"],
  available: () => true,
  priorityByCapability: {
    insider: 1,
  },
  async fetch(cap: "insider", ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    if (cap !== "insider") {
      return {
        provider: "edgar-insider",
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
      const summary = await fetchForm4Summary(ctx.ticker, 180, ctx.log);
      const txns = (summary?.topTransactions ?? []).map((t) => ({
        date: t.transactionDate,
        insiderName: t.insiderName,
        role: roleFromTitle(t.title),
        type: t.transactionType === "P" ? "buy" : "sell",
        valueUsd: t.valueUsd,
        shares: t.shares,
        isOpenMarket: t.transactionType === "P" || t.transactionType === "S",
      }));

      return {
        provider: "edgar-insider",
        capability: "insider",
        ok: true,
        data: txns,
        provenance: [
          {
            source: "edgar-insider",
            url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&owner=only&CIK=${encodeURIComponent(ctx.ticker)}`,
            klass: "A",
            asOf: ctx.runDate,
            stale: false,
          },
        ],
        raw: [
          {
            name: "edgar_insider_summary.json",
            contentType: "application/json",
            data: summary ?? {},
          },
        ],
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: "edgar-insider",
        capability: "insider",
        ok: false,
        data: [],
        provenance: [],
        raw: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  },
};
