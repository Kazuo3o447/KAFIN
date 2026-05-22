/**
 * SEC EDGAR Adapter.
 * Verwendet companyfacts (data.sec.gov) + submissions Index.
 * Rate-Limit: max 10 req/s, User-Agent ist verpflichtend.
 *
 * Klasse A- (aggregierte Primärdaten direkt von der SEC).
 */
import { throttledFetch } from "./throttle";
import type { DataProvider, ProviderContext, ProviderResult, ProviderFact } from "./types";

const UA = process.env.EDGAR_USER_AGENT || "Kafin Research (kafin@local)";
const TICKER_INDEX_URL = "https://www.sec.gov/files/company_tickers.json";

let tickerCache: Map<string, { cik: string; title: string }> | null = null;

async function loadTickerIndex(): Promise<Map<string, { cik: string; title: string }>> {
  if (tickerCache) return tickerCache;
  const res = await throttledFetch(
    TICKER_INDEX_URL,
    { headers: { "User-Agent": UA, Accept: "application/json" } },
    { ratePerSec: 8 },
  );
  if (!res.ok) throw new Error(`EDGAR ticker index ${res.status}`);
  const json = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const map = new Map<string, { cik: string; title: string }>();
  for (const k of Object.keys(json)) {
    const row = json[k];
    if (!row) continue;
    const cik = String(row.cik_str).padStart(10, "0");
    map.set(row.ticker.toUpperCase(), { cik, title: row.title });
  }
  tickerCache = map;
  return map;
}

interface CompanyFactsUnit {
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  accn?: string;
}

interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, { units?: Record<string, CompanyFactsUnit[]> }>;
    dei?: Record<string, { units?: Record<string, CompanyFactsUnit[]> }>;
  };
}

interface Submissions {
  name: string;
  sic?: string;
  sicDescription?: string;
  filings?: { recent?: { form?: string[]; filingDate?: string[]; accessionNumber?: string[]; primaryDocument?: string[] } };
}

const TARGET_USGAAP_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "GrossProfit",
  "OperatingIncomeLoss",
  "NetIncomeLoss",
  "ResearchAndDevelopmentExpense",
  "Assets",
  "Liabilities",
  "StockholdersEquity",
  "CashAndCashEquivalentsAtCarryingValue",
  "LongTermDebtNoncurrent",
  "CommonStockSharesOutstanding",
  "ShareBasedCompensation",
];

function pickLatest(units: CompanyFactsUnit[] | undefined): CompanyFactsUnit | undefined {
  if (!units || units.length === 0) return undefined;
  return [...units]
    .filter((u) => u.form === "10-K" || u.form === "10-Q" || u.form === "20-F" || u.form === "40-F")
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
}

export const edgarProvider: DataProvider = {
  name: "edgar",
  available: () => true,

  async fetch(ctx: ProviderContext): Promise<ProviderResult> {
    const start = Date.now();
    const log = ctx.log ?? (() => {});
    const facts: ProviderFact[] = [];
    const raw: ProviderResult["raw"] = [];

    try {
      const idx = await loadTickerIndex();
      const entry = idx.get(ctx.ticker.toUpperCase());
      if (!entry) {
        log(`edgar: ticker ${ctx.ticker} nicht in EDGAR-Index (vermutlich non-US)`);
        return {
          provider: "edgar",
          ok: true,
          facts,
          raw,
          durationMs: Date.now() - start,
          error: "ticker_not_in_edgar",
        };
      }
      const { cik } = entry;
      const profileUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K`;

      // Submissions
      const subRes = await throttledFetch(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        { headers: { "User-Agent": UA, Accept: "application/json" } },
        { ratePerSec: 8 },
      );
      if (subRes.ok) {
        const subs = (await subRes.json()) as Submissions;
        raw.push({ name: "edgar_submissions.json", contentType: "application/json", data: subs });
        if (subs.sicDescription) {
          facts.push({
            field: "sic_description",
            value: subs.sicDescription,
            url: profileUrl,
            klass: "A-",
          });
        }
        const recent = subs.filings?.recent;
        if (recent?.form && recent.filingDate && recent.accessionNumber && recent.primaryDocument) {
          const wanted = ["10-K", "10-Q", "20-F", "8-K"];
          for (let i = 0; i < recent.form.length && i < 30; i++) {
            const form = recent.form[i];
            const accn = recent.accessionNumber[i];
            const doc = recent.primaryDocument[i];
            const filed = recent.filingDate[i];
            if (!form || !accn || !doc || !filed) continue;
            if (!wanted.includes(form)) continue;
            const accnNoDash = accn.replace(/-/g, "");
            const filingUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accnNoDash}/${doc}`;
            facts.push({
              field: `filing_${form}`,
              value: { accn, filed, doc },
              url: filingUrl,
              title: `${form} (${filed})`,
              asOf: filed,
              klass: "A",
            });
          }
        }
      } else {
        log(`edgar: submissions HTTP ${subRes.status}`);
      }

      // CompanyFacts
      const cfRes = await throttledFetch(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        { headers: { "User-Agent": UA, Accept: "application/json" } },
        { ratePerSec: 8 },
      );
      if (cfRes.ok) {
        const cf = (await cfRes.json()) as CompanyFacts;
        raw.push({ name: "edgar_companyfacts.json", contentType: "application/json", data: cf });
        const us = cf.facts?.["us-gaap"] ?? {};
        for (const tag of TARGET_USGAAP_TAGS) {
          const node = us[tag];
          if (!node?.units) continue;
          // Bevorzugt USD, ansonsten erste verfügbare Unit
          const unitKey = node.units["USD"] ? "USD" : Object.keys(node.units)[0];
          if (!unitKey) continue;
          const latest = pickLatest(node.units[unitKey]);
          if (!latest) continue;
          facts.push({
            field: `xbrl_${tag}`,
            value: { val: latest.val, unit: unitKey, end: latest.end, form: latest.form, fp: latest.fp },
            url: profileUrl,
            title: `${tag} (${latest.form ?? "filing"} ${latest.end})`,
            asOf: latest.end,
            klass: "A-",
          });
        }
      } else if (cfRes.status !== 404) {
        log(`edgar: companyfacts HTTP ${cfRes.status}`);
      }

      log(`edgar: ${facts.length} facts extracted (cik=${cik})`);
      return {
        provider: "edgar",
        ok: true,
        facts,
        raw,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`edgar: ERROR ${msg}`);
      return { provider: "edgar", ok: false, facts, raw, error: msg, durationMs: Date.now() - start };
    }
  },
};

// ---------------------------------------------------------------------------
// Phase D helpers (non-provider, called from stepFetchBaseData if enabled)
// ---------------------------------------------------------------------------

export interface TenKSections {
  risk_factors: string;       // Item 1A
  mda: string;                // Item 7 — Management Discussion & Analysis
  business: string;           // Item 1
  accn: string;
  filed: string;
}

const TENK_SECTION_MAX_CHARS = 8_000; // truncate to keep context manageable

/**
 * Fetches the most recent 10-K filing text from EDGAR and extracts key sections.
 * Returns null when CIK not found or filing not available.
 */
export async function fetch10KSections(
  ticker: string,
  log: (msg: string) => void = () => {},
): Promise<TenKSections | null> {
  try {
    const idx = await loadTickerIndex();
    const entry = idx.get(ticker.toUpperCase());
    if (!entry) return null;
    const { cik } = entry;

    const subRes = await throttledFetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
      { ratePerSec: 8 },
    );
    if (!subRes.ok) return null;
    const subs = (await subRes.json()) as Submissions;
    const recent = subs.filings?.recent;
    if (!recent?.form) return null;

    // Find most recent 10-K
    const idx10K = recent.form.findIndex((f) => f === "10-K");
    if (idx10K < 0) return null;

    const accn = recent.accessionNumber?.[idx10K];
    const doc = recent.primaryDocument?.[idx10K];
    const filed = recent.filingDate?.[idx10K];
    if (!accn || !doc || !filed) return null;

    const accnNoDash = accn.replace(/-/g, "");
    const cikInt = parseInt(cik, 10);
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accnNoDash}/${doc}`;

    const docRes = await throttledFetch(
      docUrl,
      { headers: { "User-Agent": UA, Accept: "text/html,text/plain" } },
      { ratePerSec: 4 }, // slower for HTML docs
    );
    if (!docRes.ok) return null;

    const html = await docRes.text();
    // Strip HTML tags for section extraction
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    function extractSection(marker: RegExp, endMarker: RegExp): string {
      const startMatch = marker.exec(text);
      if (!startMatch) return "";
      const start = startMatch.index + startMatch[0].length;
      const endMatch = endMarker.exec(text.slice(start));
      const end = endMatch ? start + endMatch.index : start + 20_000;
      return text.slice(start, end).trim().slice(0, TENK_SECTION_MAX_CHARS);
    }

    const risk_factors = extractSection(
      /item\s+1a[\s.–—:]+risk\s+factors/i,
      /item\s+1b[\s.–—:]/i,
    );
    const mda = extractSection(
      /item\s+7[\s.–—:]+management.{0,30}discussion/i,
      /item\s+7a[\s.–—:]/i,
    );
    const business = extractSection(
      /item\s+1[\s.–—:]+business/i,
      /item\s+1a[\s.–—:]/i,
    );

    log(`edgar 10-K: extracted risk_factors=${risk_factors.length}c mda=${mda.length}c`);
    return { risk_factors, mda, business, accn, filed };
  } catch (err) {
    log(`edgar fetch10KSections error: ${String(err)}`);
    return null;
  }
}

export interface InsiderActivity {
  netBuyUsd: number;           // positive=net buy, negative=net sell
  topTransactions: Array<{
    insiderName: string;
    title: string;
    transactionType: "P" | "S" | "A" | "D"; // purchase/sale/award/disposition
    shares: number;
    pricePerShare: number | null;
    valueUsd: number | null;
    transactionDate: string;
  }>;
  periodDays: number;
  filingCount: number;
}

/**
 * Fetches Form 4 filings for insider transaction summary.
 * Returns last `lookbackDays` days of insider activity.
 */
export async function fetchForm4Summary(
  ticker: string,
  lookbackDays = 180,
  log: (msg: string) => void = () => {},
): Promise<InsiderActivity | null> {
  try {
    const idx = await loadTickerIndex();
    const entry = idx.get(ticker.toUpperCase());
    if (!entry) return null;
    const { cik } = entry;

    const subRes = await throttledFetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
      { ratePerSec: 8 },
    );
    if (!subRes.ok) return null;
    const subs = (await subRes.json()) as Submissions;
    const recent = subs.filings?.recent;
    if (!recent?.form) return null;

    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
    const transactions: InsiderActivity["topTransactions"] = [];
    let netBuyUsd = 0;
    let filingCount = 0;

    for (let i = 0; i < (recent.form.length ?? 0); i++) {
      const form = recent.form[i];
      const filed = recent.filingDate?.[i];
      if (form !== "4" || !filed || filed < cutoff) continue;

      filingCount++;
      // We parse Form 4 XML to extract transactions (best-effort)
      const accn = recent.accessionNumber?.[i];
      if (!accn) continue;
      const accnNoDash = accn.replace(/-/g, "");
      const cikInt = parseInt(cik, 10);
      // The primary document for Form 4 is typically an XML file
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accnNoDash}/${recent.primaryDocument?.[i] ?? ""}`;

      try {
        const xmlRes = await throttledFetch(
          xmlUrl,
          { headers: { "User-Agent": UA } },
          { ratePerSec: 4 },
        );
        if (!xmlRes.ok) continue;
        const xml = await xmlRes.text();

        // Simple regex-based extraction (avoids XML parser dependency)
        const rptOwner = /<rptOwnerName>([^<]*)<\/rptOwnerName>/i.exec(xml)?.[1] ?? "Unknown";
        const rptTitle = /<officerTitle>([^<]*)<\/officerTitle>/i.exec(xml)?.[1] ?? "";
        const txnCode = /<transactionCode>([^<]*)<\/transactionCode>/i.exec(xml)?.[1] ?? "?";
        const txnDate = /<transactionDate>\s*<value>([^<]*)<\/value>/i.exec(xml)?.[1] ?? filed;
        const sharesStr = /<transactionShares>\s*<value>([^<]*)<\/value>/i.exec(xml)?.[1] ?? "0";
        const priceStr = /<transactionPricePerShare>\s*<value>([^<]*)<\/value>/i.exec(xml)?.[1];

        const shares = parseFloat(sharesStr) || 0;
        const price = priceStr ? parseFloat(priceStr) : null;
        const valueUsd = price !== null ? shares * price : null;

        // P/S = Purchase / Sale
        const isBuy = txnCode === "P";
        const isSell = txnCode === "S";
        if (valueUsd !== null) {
          if (isBuy) netBuyUsd += valueUsd;
          if (isSell) netBuyUsd -= valueUsd;
        }

        if (isBuy || isSell) {
          transactions.push({
            insiderName: rptOwner,
            title: rptTitle,
            transactionType: txnCode as "P" | "S" | "A" | "D",
            shares,
            pricePerShare: price,
            valueUsd,
            transactionDate: txnDate,
          });
        }
      } catch {
        // skip individual filing parse errors
      }
    }

    log(`edgar Form4: ${filingCount} filings, netBuy=$${(netBuyUsd / 1e6).toFixed(2)}M`);
    return {
      netBuyUsd,
      topTransactions: transactions.slice(0, 20),
      periodDays: lookbackDays,
      filingCount,
    };
  } catch (err) {
    log(`edgar fetchForm4Summary error: ${String(err)}`);
    return null;
  }
}
