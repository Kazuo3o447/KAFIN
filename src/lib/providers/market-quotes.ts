/**
 * market-quotes.ts — Provider für das Asset-Quotes-Board auf der /markets-Seite.
 * Fetched Indizes, Zinsen, Vol, Credit, Rohstoffe, FX und Krypto via Yahoo Finance.
 *
 * Capability: "market_quotes" (nicht Teil des Firmen-Capability-Sammlers —
 * wird direkt vom /api/market/health-Endpunkt gerufen, nicht über collect.ts).
 *
 * MOVE-Index: proprietärer ICE-Index, kostenlos in Echtzeit nicht frei verfügbar.
 * Wir verwenden den verfügbaren Proxy ^MOVE über Yahoo oder kennzeichnen als "verzögert/Proxy".
 */

import { throttledFetch } from "@/lib/providers/throttle";

export interface AssetQuote {
  symbol: string;
  label: string;
  category: "index" | "rate" | "vol" | "credit_proxy" | "commodity" | "fx" | "crypto";
  price: number | null;
  change1d: number | null;
  change1dPct: number | null;
  asOf: string | null;
  /** true wenn Wert nur als verzögerter Proxy verfügbar ist (z. B. MOVE) */
  isProxy?: boolean;
  currency?: string;
  /** 52-Wochen-Hoch */
  high52w?: number | null;
  /** 52-Wochen-Tief */
  low52w?: number | null;
  /** 50-Tage-Durchschnitt */
  ma50?: number | null;
  /** 200-Tage-Durchschnitt */
  ma200?: number | null;
  /** Trend-Lage: 'above_both' | 'between' | 'below_both' | null */
  maTrend?: string | null;
}

// Symbole — Yahoo Finance Ticker
const QUOTE_SYMBOLS: Array<{
  symbol: string;
  label: string;
  category: AssetQuote["category"];
  isProxy?: boolean;
}> = [
  // Indizes
  { symbol: "^GSPC", label: "S&P 500", category: "index" },
  { symbol: "^IXIC", label: "Nasdaq", category: "index" },
  { symbol: "^RUT", label: "Russell 2000", category: "index" },
  // Zinsen (aus Yahoo via ^TNX/^TYX/^FVX/^IRX)
  { symbol: "^TNX", label: "10Y Yield", category: "rate" },
  { symbol: "^FVX", label: "5Y Yield", category: "rate" },
  { symbol: "^IRX", label: "3M Yield", category: "rate" },
  // Volatilität
  { symbol: "^VIX", label: "VIX", category: "vol" },
  { symbol: "^MOVE", label: "MOVE (Proxy)", category: "vol", isProxy: true },
  // Rohstoffe
  { symbol: "GC=F", label: "Gold", category: "commodity" },
  { symbol: "CL=F", label: "WTI Crude", category: "commodity" },
  { symbol: "BZ=F", label: "Brent Crude", category: "commodity" },
  { symbol: "HG=F", label: "Kupfer", category: "commodity" },
  // FX
  { symbol: "DX-Y.NYB", label: "DXY", category: "fx" },
  // Krypto
  { symbol: "BTC-USD", label: "Bitcoin", category: "crypto" },
];

interface YahooQuoteRaw {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  regularMarketTime?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
}

export async function fetchMarketQuotes(): Promise<AssetQuote[]> {
  const symbols = QUOTE_SYMBOLS.map((s) => s.symbol).join(",");
  const fields = [
    "regularMarketPrice",
    "regularMarketChange",
    "regularMarketChangePercent",
    "currency",
    "regularMarketTime",
    "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow",
    "fiftyDayAverage",
    "twoHundredDayAverage",
  ].join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`;

  let rawQuotes: YahooQuoteRaw[] = [];
  try {
    const res = await throttledFetch(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 kafin-market-monitor/1.0",
          Accept: "application/json",
        },
      },
      { ratePerSec: 2 }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        quoteResponse?: { result?: YahooQuoteRaw[] };
      };
      rawQuotes = json.quoteResponse?.result ?? [];
    }
  } catch {
    // Partial failure — return what we have (empty)
  }

  const bySymbol = new Map(rawQuotes.map((q) => [q.symbol, q]));

  return QUOTE_SYMBOLS.map(({ symbol, label, category, isProxy }) => {
    const raw = bySymbol.get(symbol);
    const price = raw?.regularMarketPrice ?? null;
    const ma50 = raw?.fiftyDayAverage ?? null;
    const ma200 = raw?.twoHundredDayAverage ?? null;
    const maTrend =
      price != null && ma50 != null && ma200 != null
        ? price > ma50 && price > ma200
          ? "above_both"
          : price < ma50 && price < ma200
          ? "below_both"
          : "between"
        : null;
    if (!raw) {
      return {
        symbol,
        label,
        category,
        price: null,
        change1d: null,
        change1dPct: null,
        asOf: null,
        isProxy,
      };
    }
    return {
      symbol,
      label,
      category,
      price,
      change1d: raw.regularMarketChange ?? null,
      change1dPct: raw.regularMarketChangePercent ?? null,
      asOf: raw.regularMarketTime
        ? new Date(raw.regularMarketTime * 1000).toISOString()
        : null,
      isProxy,
      currency: raw.currency,
      high52w: raw.fiftyTwoWeekHigh ?? null,
      low52w: raw.fiftyTwoWeekLow ?? null,
      ma50,
      ma200,
      maTrend,
    };
  });
}
