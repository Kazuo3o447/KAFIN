import YahooFinance from "yahoo-finance2";
import { sqlite } from "@/lib/storage/db";
import type { DataProviderV2, ProviderContext, ProviderFetchResultV2 } from "@/lib/providers/types";
import { readSecretFromEnvOrSettings } from "@/lib/providers/settings";

const yahoo = new YahooFinance();

export interface SymbolResolution {
  input: string;
  ticker: string;
  exchange: string | null;
  name: string | null;
  isin: string | null;
  wkn: string | null;
  currency: string | null;
  country: string | null;
  source: "cache" | "yahoo" | "openfigi";
  url: string;
  asOf: string;
}

function ensureSymbolMapTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS symbol_map (
      input_key TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      exchange TEXT,
      name TEXT,
      isin TEXT,
      wkn TEXT,
      currency TEXT,
      country TEXT,
      source TEXT NOT NULL,
      as_of TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function normalizeKey(input: string): string {
  return input.trim().toUpperCase();
}

function letterValue(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String(code - 55);
  }
  return char;
}

function isinChecksum(isin: string): boolean {
  const transformed = isin
    .split("")
    .map((c) => letterValue(c))
    .join("");

  let sum = 0;
  const reversed = transformed.split("").reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    const digit = Number(reversed[i]);
    if (!Number.isFinite(digit)) return false;
    let n = digit;
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function normalizeIsin(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(cleaned)) return null;
  return isinChecksum(cleaned) ? cleaned : null;
}

function normalizeWkn(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{6}$/.test(cleaned) ? cleaned : null;
}

function readCache(input: string): SymbolResolution | null {
  ensureSymbolMapTable();
  const row = sqlite
    .prepare(
      `SELECT input_key, ticker, exchange, name, isin, wkn, currency, country, source, as_of FROM symbol_map WHERE input_key = ?`,
    )
    .get(normalizeKey(input)) as
    | {
        input_key: string;
        ticker: string;
        exchange: string | null;
        name: string | null;
        isin: string | null;
        wkn: string | null;
        currency: string | null;
        country: string | null;
        source: string;
        as_of: string;
      }
    | undefined;
  if (!row) return null;
  return {
    input,
    ticker: row.ticker,
    exchange: row.exchange,
    name: row.name,
    isin: row.isin,
    wkn: row.wkn,
    currency: row.currency,
    country: row.country,
    source: row.source === "openfigi" ? "openfigi" : row.source === "yahoo" ? "yahoo" : "cache",
    url: row.source === "openfigi" ? "https://www.openfigi.com/" : "https://finance.yahoo.com/",
    asOf: row.as_of,
  };
}

function writeCache(resolution: SymbolResolution): void {
  ensureSymbolMapTable();
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO symbol_map (input_key, ticker, exchange, name, isin, wkn, currency, country, source, as_of, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(input_key) DO UPDATE SET
         ticker=excluded.ticker,
         exchange=excluded.exchange,
         name=excluded.name,
         isin=excluded.isin,
         wkn=excluded.wkn,
         currency=excluded.currency,
         country=excluded.country,
         source=excluded.source,
         as_of=excluded.as_of,
         updated_at=excluded.updated_at`,
    )
    .run(
      normalizeKey(resolution.input),
      resolution.ticker,
      resolution.exchange,
      resolution.name,
      resolution.isin,
      resolution.wkn,
      resolution.currency,
      resolution.country,
      resolution.source,
      resolution.asOf,
      now,
      now,
    );
}

function makeTickerGuess(input: string): string {
  return input.trim().toUpperCase();
}

async function resolveViaYahoo(input: string): Promise<SymbolResolution | null> {
  const normalized = normalizeKey(input);
  const now = new Date().toISOString().slice(0, 10);

  const search = await yahoo.search(normalized, { quotesCount: 8, newsCount: 0 });
  const hit = search.quotes?.find((q) => typeof q.symbol === "string") ?? null;
  if (!hit || typeof hit.symbol !== "string") return null;

  return {
    input,
    ticker: hit.symbol.toUpperCase(),
    exchange: typeof hit.exchange === "string" ? hit.exchange : null,
    name: typeof hit.shortname === "string" ? hit.shortname : typeof hit.longname === "string" ? hit.longname : null,
    isin: normalizeIsin((hit as Record<string, unknown>).isin),
    wkn: normalizeWkn((hit as Record<string, unknown>).wkn),
    currency: typeof (hit as Record<string, unknown>).currency === "string" ? String((hit as Record<string, unknown>).currency) : null,
    country: typeof (hit as Record<string, unknown>).region === "string" ? String((hit as Record<string, unknown>).region) : null,
    source: "yahoo",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(hit.symbol)}`,
    asOf: now,
  };
}

async function resolveViaOpenFigi(input: string): Promise<SymbolResolution | null> {
  const key = readSecretFromEnvOrSettings("OPENFIGI_API_KEY", "openfigi_api_key");
  if (!key) return null;
  const isin = normalizeIsin(input);
  const wkn = normalizeWkn(input);
  if (!isin && !wkn) return null;

  const body = isin
    ? [{ idType: "ID_ISIN", idValue: isin }]
    : [{ idType: "ID_WERTPAPIER", idValue: wkn ?? "" }];

  const res = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OPENFIGI-APIKEY": key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as Array<{ data?: Array<Record<string, unknown>> }>;
  const first = json[0]?.data?.[0];
  if (!first) return null;

  const ticker = typeof first.ticker === "string" ? first.ticker.toUpperCase() : null;
  if (!ticker) return null;

  return {
    input,
    ticker,
    exchange: typeof first.exchCode === "string" ? first.exchCode : null,
    name: typeof first.name === "string" ? first.name : null,
    isin,
    wkn,
    currency: typeof first.currency === "string" ? first.currency : null,
    country: typeof first.marketSector === "string" ? first.marketSector : null,
    source: "openfigi",
    url: "https://www.openfigi.com/",
    asOf: new Date().toISOString().slice(0, 10),
  };
}

export async function resolveSymbol(input: string): Promise<SymbolResolution> {
  const cached = readCache(input);
  if (cached) return cached;

  try {
    const maybeFigi = await resolveViaOpenFigi(input);
    if (maybeFigi) {
      writeCache(maybeFigi);
      return maybeFigi;
    }
  } catch {
    // best-effort provider
  }

  try {
    const maybeYahoo = await resolveViaYahoo(input);
    if (maybeYahoo) {
      writeCache(maybeYahoo);
      return maybeYahoo;
    }
  } catch {
    // best-effort provider
  }

  const fallback: SymbolResolution = {
    input,
    ticker: makeTickerGuess(input),
    exchange: null,
    name: null,
    isin: normalizeIsin(input),
    wkn: normalizeWkn(input),
    currency: null,
    country: null,
    source: "cache",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(makeTickerGuess(input))}`,
    asOf: new Date().toISOString().slice(0, 10),
  };
  writeCache(fallback);
  return fallback;
}

export const symbolResolutionProviderV2: DataProviderV2 = {
  name: "symbol-resolution",
  capabilities: ["symbol_resolution"],
  available: () => true,
  priorityByCapability: {
    symbol_resolution: 1,
  },
  async fetch(cap: "symbol_resolution", ctx: ProviderContext): Promise<ProviderFetchResultV2> {
    const start = Date.now();
    if (cap !== "symbol_resolution") {
      return {
        provider: "symbol-resolution",
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
      const resolved = await resolveSymbol(ctx.ticker);
      return {
        provider: "symbol-resolution",
        capability: "symbol_resolution",
        ok: true,
        data: resolved,
        provenance: [
          {
            source: "symbol-resolution",
            url: resolved.url,
            klass: "B",
            asOf: resolved.asOf,
            stale: false,
          },
        ],
        raw: [
          {
            name: "symbol_resolution.json",
            contentType: "application/json",
            data: resolved,
          },
        ],
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: "symbol-resolution",
        capability: "symbol_resolution",
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
