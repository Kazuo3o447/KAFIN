/**
 * RSS Adapter — sammelt News aus Yahoo-Finance- und PR-Feeds.
 * Phase 2 lädt zusätzlich Sentiment via FinBERT (siehe FUTURE.md F-003).
 * Klasse C/D.
 */
import Parser from "rss-parser";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";
import type { Capability, DataProviderV2, ProviderFetchResultV2 } from "./types";

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

const SPAM_PATTERNS = [
  /\btop\s+\d+\s+stocks\b/i,
  /\b\d+\s+stocks\s+to\s+(buy|sell|watch)\b/i,
  /\bbest\s+stocks?\s+to\s+buy\b/i,
  /\bstocks?\s+that\s+could\s+make\s+you\s+(rich|a\s+millionaire)\b/i,
  /\bbillionaire[s]?\s+(are\s+)?buying\b/i,
  /\bshould\s+you\s+buy\b/i,
  /\bis\s+.+\s+a\s+buy\b/i,
  /\bmotley\s+fool\b/i,
  /\bzacks\b/i,
  /\binvestorplace\b/i,
  /\bwatchlist:\s*\d+\b/i,
  /\betf\b/i,
];

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Phase E: Prompt-Injection-Hardening.
 * Strips or rejects news content that contains LLM-directive patterns.
 * This prevents adversarial content in RSS feeds from hijacking the pipeline.
 */
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions?/i,
  /ignore\s+all\s+instructions?/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /system\s+prompt/i,
  /\[INST\]/i,
  /\<\|im_start\|\>/i,
  /\<\|system\|\>/i,
  /\{%\s*system/i,
  /assistant:\s*\n/i,
  /human:\s*\n/i,
  /JAILBREAK/i,
  /DAN\s+mode/i,
  /as\s+an\s+AI\s+without\s+restrictions/i,
  /pretend\s+you\s+are\s+a/i,
];

function stripInjectionContent(text: string): string {
  // Remove known injection markers; if found, return truncated/redacted version
  if (INJECTION_PATTERNS.some((p) => p.test(text))) {
    return "[REDACTED: potential prompt injection detected]";
  }
  return text;
}

function isUsableNewsItem(
  ticker: string,
  item: { title?: string; link?: string; contentSnippet?: string; content?: string },
): boolean {
  const title = item.title ?? "";
  const snippet = item.contentSnippet ?? item.content ?? "";
  const text = `${title} ${snippet}`;
  if (!title || !item.link) return false;
  if (SPAM_PATTERNS.some((pattern) => pattern.test(text))) return false;

  const tickerPattern = new RegExp(`(^|[^a-z0-9])${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
  return tickerPattern.test(text) || tickerPattern.test(item.link);
}

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
          const seenTitles = new Set<string>();
          const items = (parsed.items ?? [])
            .filter((item) => isUsableNewsItem(ctx.ticker, item))
            .filter((item) => {
              const key = normalizeTitle(item.title ?? item.link ?? "");
              if (seenTitles.has(key)) return false;
              seenTitles.add(key);
              return true;
            })
            .slice(0, 10);
          items.forEach((item, idx) => {
            if (!item.link) return;
            const rawTitle = item.title ?? "";
            const rawSnippet = (item.contentSnippet ?? item.content ?? "").substring(0, 400);
            facts.push({
              field: `news_${feed.label.replace(/\s+/g, "")}_${idx}`,
              value: {
                title: stripInjectionContent(rawTitle),
                snippet: stripInjectionContent(rawSnippet),
                isoDate: item.isoDate ?? null,
              },
              url: item.link,
              title: stripInjectionContent(rawTitle) || feed.label,
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

export const rssProviderV2: DataProviderV2 = {
  name: "rss",
  capabilities: [],
  available: () => true,
  priorityByCapability: {},
  async fetch(cap: Capability): Promise<ProviderFetchResultV2> {
    return {
      provider: "rss",
      capability: cap,
      ok: false,
      data: null,
      provenance: [],
      raw: [],
      error: "unsupported_capability",
      durationMs: 0,
    };
  },
};
