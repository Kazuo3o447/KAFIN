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
