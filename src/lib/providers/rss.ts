/**
 * RSS Adapter — sammelt News aus Yahoo-Finance- und PR-Feeds.
 * Phase 2 lädt zusätzlich Sentiment via FinBERT (siehe FUTURE.md F-003).
 * Klasse C/D.
 */
import Parser from "rss-parser";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Kafin Research RSS" },
});

const FEEDS = (ticker: string): Array<{ url: string; klass: "C" | "D"; label: string }> => [
  {
    url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`,
    klass: "C",
    label: "Yahoo News",
  },
  {
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(ticker)}+stock&hl=en-US&gl=US&ceid=US:en`,
    klass: "D",
    label: "Google News",
  },
];

export const rssProvider: DataProvider = {
  name: "rss",
  available: () => true,

  async fetch(ctx: ProviderContext): Promise<ProviderResult> {
    const start = Date.now();
    const log = ctx.log ?? (() => {});
    const facts: ProviderFact[] = [];
    const raw: ProviderResult["raw"] = [];

    try {
      for (const feed of FEEDS(ctx.ticker)) {
        try {
          const parsed = await parser.parseURL(feed.url);
          raw.push({
            name: `rss_${feed.label.toLowerCase().replace(/\s+/g, "_")}.json`,
            contentType: "application/json",
            data: parsed,
          });
          const items = (parsed.items ?? []).slice(0, 15);
          items.forEach((item, idx) => {
            if (!item.link) return;
            facts.push({
              field: `news_${feed.label.replace(/\s+/g, "")}_${idx}`,
              value: {
                title: item.title ?? "",
                snippet: (item.contentSnippet ?? item.content ?? "").substring(0, 400),
                isoDate: item.isoDate ?? null,
              },
              url: item.link,
              title: item.title ?? feed.label,
              asOf: item.isoDate ?? undefined,
              klass: feed.klass,
            });
          });
          log(`rss: ${feed.label}: ${items.length} items`);
        } catch (err) {
          log(`rss: ${feed.label} fail ${(err as Error).message}`);
        }
      }
      return { provider: "rss", ok: true, facts, raw, durationMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { provider: "rss", ok: false, facts, raw, error: msg, durationMs: Date.now() - start };
    }
  },
};
