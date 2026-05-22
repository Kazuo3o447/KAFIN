/**
 * Forensische Scores: Piotroski F, Mohanram G, Altman Z, Beneish M.
 * Alle Berechnungen rein deterministisch aus EDGAR-XBRL + FMP-Statements.
 * Fehlende Inputs → null. Coverage sinkt automatisch in signals.ts.
 *
 * Quellen:
 *  - Piotroski (2000): "Value Investing: The Use of Historical Financial Information to
 *    Separate Winners from Losers"
 *  - Mohanram (2005): "Separating Winners from Losers among Low Book-to-Market Stocks"
 *  - Altman (1968): "Financial Ratios, Discriminant Analysis and the Prediction of
 *    Corporate Bankruptcy"
 *  - Beneish (1999): "The Detection of Earnings Manipulation"
 */
import type { ProviderFact } from "@/lib/providers/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null) {
    const rec = value as Record<string, unknown>;
    for (const k of ["val", "value", "raw"]) {
      const n = toNum(rec[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

function readField(rec: Record<string, unknown>, keys: string[]): number | null {
  const lookup = new Map(Object.keys(rec).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lookup.get(key.toLowerCase());
    if (!actual) continue;
    const n = toNum(rec[actual]);
    if (n !== null) return n;
  }
  return null;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
  }
  if (typeof value !== "object" || value === null) return [];
  const rec = value as Record<string, unknown>;
  for (const k of ["annualReports", "quarterlyReports", "data", "financials"]) {
    const arr = rec[k];
    if (Array.isArray(arr)) return arr.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
  }
  return [];
}

function getDate(rec: Record<string, unknown>): string {
  for (const k of ["date", "fiscalDateEnding", "calendarYear", "end", "period"]) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

type AnnualRow = {
  date: string;
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  netIncome: number | null;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  cfo: number | null;               // Operating Cash Flow
  longTermDebt: number | null;
  sharesOutstanding: number | null;
  retainedEarnings: number | null;
  sga: number | null;               // SG&A
  depreciation: number | null;
  receivables: number | null;
  inventory: number | null;
  ppe: number | null;               // Property Plant & Equipment (net)
  marketCap: number | null;
};

function extractAnnualRows(facts: ProviderFact[]): AnnualRow[] {
  const rowMap = new Map<string, AnnualRow>();

  const INCOME_FIELDS = ["income_statement", "income-statement", "av_income_statement", "fmp_income_statement_q"];
  const BALANCE_FIELDS = ["balance_sheet", "balance-sheet", "av_balance_sheet", "fmp_balance_sheet_q"];
  const CASHFLOW_FIELDS = ["cashflow", "cash-flow", "av_cash_flow", "fmp_cashflow_q"];

  function merge(date: string, partial: Partial<AnnualRow>) {
    const existing = rowMap.get(date) ?? { date } as AnnualRow;
    for (const [k, v] of Object.entries(partial) as [keyof AnnualRow, unknown][]) {
      if (v !== null && v !== undefined && (existing[k] === null || existing[k] === undefined)) {
        (existing as Record<string, unknown>)[k] = v;
      }
    }
    rowMap.set(date, existing);
  }

  for (const fact of facts) {
    const field = fact.field.toLowerCase();
    const isIncome  = INCOME_FIELDS.some((n) => field.includes(n));
    const isBalance = BALANCE_FIELDS.some((n) => field.includes(n));
    const isCashflow = CASHFLOW_FIELDS.some((n) => field.includes(n));
    if (!isIncome && !isBalance && !isCashflow) continue;

    for (const row of asRows(fact.value)) {
      const date = getDate(row);
      if (!date) continue;

      if (isIncome) {
        merge(date, {
          netIncome:       readField(row, ["netIncome", "net_income", "NetIncomeLoss"]),
          revenue:         readField(row, ["revenue", "totalRevenue", "Revenue", "Revenues"]),
          grossProfit:     readField(row, ["grossProfit", "gross_profit", "GrossProfit"]),
          operatingIncome: readField(row, ["operatingIncome", "operating_income", "OperatingIncomeLoss"]),
          sga:             readField(row, ["sellingGeneralAndAdministrativeExpenses", "sga", "sgaExpenses"]),
          depreciation:    readField(row, ["depreciationAndAmortization", "depreciation"]),
        });
      }
      if (isBalance) {
        merge(date, {
          totalAssets:       readField(row, ["totalAssets", "Assets"]),
          totalLiabilities:  readField(row, ["totalLiabilities", "Liabilities"]),
          currentAssets:     readField(row, ["totalCurrentAssets", "currentAssets"]),
          currentLiabilities:readField(row, ["totalCurrentLiabilities", "currentLiabilities"]),
          longTermDebt:      readField(row, ["longTermDebt", "LongTermDebtNoncurrent"]),
          sharesOutstanding: readField(row, ["commonStockSharesOutstanding", "weightedAverageShsOutDil"]),
          retainedEarnings:  readField(row, ["retainedEarnings", "RetainedEarningsAccumulatedDeficit"]),
          receivables:       readField(row, ["netReceivables", "receivables", "AccountsReceivableNetCurrent"]),
          inventory:         readField(row, ["inventory", "InventoryNet"]),
          ppe:               readField(row, ["propertyPlantEquipmentNet", "PropertyPlantAndEquipmentNet"]),
        });
      }
      if (isCashflow) {
        merge(date, {
          cfo: readField(row, ["operatingCashFlow", "netCashProvidedByOperatingActivities", "cashFromOperations"]),
        });
      }
    }
  }

  // Inject market cap from quote-level facts (single value, not time series)
  const mcapFact = facts.find((f) => f.field === "market_cap");
  if (mcapFact) {
    const mc = toNum(mcapFact.value);
    if (mc !== null) {
      for (const row of rowMap.values()) row.marketCap = mc;
    }
  }

  return Array.from(rowMap.values())
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Piotroski F-Score
// ---------------------------------------------------------------------------

export interface PiotroskiResult {
  score: number | null;
  components: Record<string, 0 | 1 | null>;
}

export function computePiotroskiF(facts: ProviderFact[]): PiotroskiResult {
  const rows = extractAnnualRows(facts);
  const curr = rows[0];
  const prev = rows[1];

  if (!curr) return { score: null, components: {} };

  const comps: Record<string, 0 | 1 | null> = {};

  function signal(name: string, cond: boolean | null): void {
    comps[name] = cond === null ? null : cond ? 1 : 0;
  }

  // F1: ROA > 0
  const roa = curr.totalAssets && curr.totalAssets > 0 && curr.netIncome !== null
    ? curr.netIncome / curr.totalAssets : null;
  signal("F1_roa_positive", roa !== null ? roa > 0 : null);

  // F2: CFO > 0
  signal("F2_cfo_positive", curr.cfo !== null ? curr.cfo > 0 : null);

  // F3: ROA aktuell > ROA Vorjahr
  const prevRoa = prev && prev.totalAssets && prev.totalAssets > 0 && prev.netIncome !== null
    ? prev.netIncome / prev.totalAssets : null;
  signal("F3_roa_improved", roa !== null && prevRoa !== null ? roa > prevRoa : null);

  // F4: CFO > Net Income (Accruals-Check)
  signal("F4_accruals_quality", curr.cfo !== null && curr.netIncome !== null ? curr.cfo > curr.netIncome : null);

  // F5: Long-term Debt aktuell < Vorjahr (leverage improving)
  signal("F5_leverage_improved",
    prev && curr.longTermDebt !== null && prev.longTermDebt !== null
      ? curr.longTermDebt < prev.longTermDebt
      : null);

  // F6: Current Ratio aktuell > Vorjahr
  const currRatioCurr = curr.currentAssets !== null && curr.currentLiabilities !== null && curr.currentLiabilities > 0
    ? curr.currentAssets / curr.currentLiabilities : null;
  const currRatioPrev = prev && prev.currentAssets !== null && prev.currentLiabilities !== null && prev.currentLiabilities > 0
    ? prev.currentAssets / prev.currentLiabilities : null;
  signal("F6_liquidity_improved", currRatioCurr !== null && currRatioPrev !== null ? currRatioCurr > currRatioPrev : null);

  // F7: Keine neuen Aktien ausgegeben
  signal("F7_no_dilution",
    prev && curr.sharesOutstanding !== null && prev.sharesOutstanding !== null
      ? curr.sharesOutstanding <= prev.sharesOutstanding * 1.001  // 0.1% tolerance
      : null);

  // F8: Gross Margin aktuell > Vorjahr
  const gmCurr = curr.revenue && curr.revenue > 0 && curr.grossProfit !== null ? curr.grossProfit / curr.revenue : null;
  const gmPrev = prev && prev.revenue && prev.revenue > 0 && prev.grossProfit !== null ? prev.grossProfit / prev.revenue : null;
  signal("F8_gm_improved", gmCurr !== null && gmPrev !== null ? gmCurr > gmPrev : null);

  // F9: Asset Turnover aktuell > Vorjahr
  const atCurr = curr.totalAssets && curr.totalAssets > 0 && curr.revenue !== null ? curr.revenue / curr.totalAssets : null;
  const atPrev = prev && prev.totalAssets && prev.totalAssets > 0 && prev.revenue !== null ? prev.revenue / prev.totalAssets : null;
  signal("F9_asset_turnover_improved", atCurr !== null && atPrev !== null ? atCurr > atPrev : null);

  const definedScores = Object.values(comps).filter((v): v is 0 | 1 => v !== null);
  if (definedScores.length === 0) return { score: null, components: comps };

  const score = definedScores.reduce<number>((sum, v) => sum + v, 0);
  return { score, components: comps };
}

// ---------------------------------------------------------------------------
// Mohanram G-Score (Mohanram 2005, growth-specific)
// ---------------------------------------------------------------------------

export interface MohanramResult {
  score: number | null;
  components: Record<string, 0 | 1 | null>;
  coverage: number; // fraction of signals computable
}

export function computeMohanramG(facts: ProviderFact[]): MohanramResult {
  const rows = extractAnnualRows(facts);
  const curr = rows[0];
  const prev = rows[1];
  const prev2 = rows[2];

  if (!curr) return { score: null, components: {}, coverage: 0 };

  const comps: Record<string, 0 | 1 | null> = {};
  function signal(name: string, cond: boolean | null) { comps[name] = cond === null ? null : cond ? 1 : 0; }

  // G1: ROA above industry median proxy (use > 0 as proxy when median unavailable)
  const roa = curr.totalAssets && curr.totalAssets > 0 && curr.netIncome !== null
    ? curr.netIncome / curr.totalAssets : null;
  signal("G1_roa_above_median", roa !== null ? roa > 0 : null);

  // G2: CFO / Total Assets > median (use > 0 as proxy)
  const cfoRoa = curr.totalAssets && curr.totalAssets > 0 && curr.cfo !== null
    ? curr.cfo / curr.totalAssets : null;
  signal("G2_cfo_roa_positive", cfoRoa !== null ? cfoRoa > 0 : null);

  // G3: Cash Earnings > Accounting Earnings (Earnings Quality)
  signal("G3_cash_beats_accounting",
    curr.cfo !== null && curr.netIncome !== null ? curr.cfo > curr.netIncome : null);

  // G4: R&D spending increasing (proxy: missing → null) — use SG&A as proxy
  const sgaCurr = curr.sga ?? null;
  const sgaPrev = prev?.sga ?? null;
  const rev = curr.revenue ?? null;
  const prevRev = prev?.revenue ?? null;
  const sgaRatioCurr = sgaCurr !== null && rev !== null && rev > 0 ? sgaCurr / rev : null;
  const sgaRatioPrev = sgaPrev !== null && prevRev !== null && prevRev > 0 ? sgaPrev / prevRev : null;
  signal("G4_rnd_intensity_stable",
    sgaRatioCurr !== null && sgaRatioPrev !== null ? sgaRatioCurr <= sgaRatioPrev * 1.1 : null);

  // G5: Capital Expenditure increasing (investment growth signal)
  const depCurr = curr.depreciation ?? null;
  const depPrev = prev?.depreciation ?? null;
  signal("G5_capex_growth",
    depCurr !== null && depPrev !== null && depPrev > 0 ? depCurr > depPrev : null);

  // G6: Sales growth acceleration (curr growth > prior growth)
  const growthCurr = prev && prev.revenue && prev.revenue > 0 && curr.revenue !== null
    ? (curr.revenue / prev.revenue) - 1 : null;
  const growthPrev = prev2 && prev2.revenue && prev2.revenue > 0 && prev && prev.revenue !== null
    ? (prev.revenue / prev2.revenue) - 1 : null;
  signal("G6_revenue_growth_accel",
    growthCurr !== null && growthPrev !== null ? growthCurr > growthPrev : null);

  // G7: Low book-to-market proxy: Revenue / (Total Assets) > 0.5 (asset-light)
  const assetLight = curr.totalAssets && curr.totalAssets > 0 && curr.revenue !== null
    ? curr.revenue / curr.totalAssets > 0.5 : null;
  signal("G7_asset_light", assetLight);

  // G8: Consistent earnings — no loss in last 3 years
  const hasLoss = [curr, prev, prev2].some((r) => r && r.netIncome !== null && r.netIncome < 0);
  const hasData = [curr, prev, prev2].filter((r) => r && r.netIncome !== null).length >= 2;
  signal("G8_consistent_earnings", hasData ? !hasLoss : null);

  const defined = Object.values(comps).filter((v): v is 0 | 1 => v !== null);
  const coverage = Object.keys(comps).length > 0 ? defined.length / Object.keys(comps).length : 0;

  if (defined.length === 0) return { score: null, components: comps, coverage: 0 };
  return { score: defined.reduce<number>((s, v) => s + v, 0), components: comps, coverage };
}

// ---------------------------------------------------------------------------
// Altman Z-Score (1968, industrial firms)
// ---------------------------------------------------------------------------

export type AltmanClassification = "safe" | "grey" | "distress" | null;

export interface AltmanResult {
  score: number | null;
  classification: AltmanClassification;
}

export function computeAltmanZ(facts: ProviderFact[]): AltmanResult {
  const rows = extractAnnualRows(facts);
  const curr = rows[0];
  if (!curr?.totalAssets || curr.totalAssets <= 0) return { score: null, classification: null };

  const ta = curr.totalAssets;
  const wc = curr.currentAssets !== null && curr.currentLiabilities !== null
    ? curr.currentAssets - curr.currentLiabilities : null;
  const re = curr.retainedEarnings;
  const ebit = curr.operatingIncome;
  const mc = curr.marketCap;
  const tl = curr.totalLiabilities;
  const rev = curr.revenue;

  if (wc === null || re === null || ebit === null || mc === null || tl === null || rev === null || tl <= 0) {
    return { score: null, classification: null };
  }

  const z = 1.2 * (wc / ta) + 1.4 * (re / ta) + 3.3 * (ebit / ta) + 0.6 * (mc / tl) + 1.0 * (rev / ta);

  let classification: AltmanClassification;
  if (z > 3.0) classification = "safe";
  else if (z >= 1.8) classification = "grey";
  else classification = "distress";

  return { score: Number(z.toFixed(4)), classification };
}

// ---------------------------------------------------------------------------
// Beneish M-Score (1999, 8 variables)
// ---------------------------------------------------------------------------

export type ManipulationProbability = "low" | "high" | null;

export interface BeneishResult {
  score: number | null;
  manipulationProbability: ManipulationProbability;
}

export function computeBeneishM(facts: ProviderFact[]): BeneishResult {
  const rows = extractAnnualRows(facts);
  const curr = rows[0];
  const prev = rows[1];

  if (!curr || !prev) return { score: null, manipulationProbability: null };

  function safe(n: number | null, d: number | null): number | null {
    if (n === null || d === null || d === 0) return null;
    return n / d;
  }

  // DSRI: Days Sales Receivable Index
  const dsri = (() => {
    const dsr_curr = curr.receivables !== null && curr.revenue !== null && curr.revenue > 0
      ? curr.receivables / curr.revenue : null;
    const dsr_prev = prev.receivables !== null && prev.revenue !== null && prev.revenue > 0
      ? prev.receivables / prev.revenue : null;
    return safe(dsr_curr, dsr_prev);
  })();

  // GMI: Gross Margin Index
  const gmi = (() => {
    const gm_curr = curr.revenue && curr.revenue > 0 && curr.grossProfit !== null ? curr.grossProfit / curr.revenue : null;
    const gm_prev = prev.revenue && prev.revenue > 0 && prev.grossProfit !== null ? prev.grossProfit / prev.revenue : null;
    if (gm_curr === null || gm_prev === null || gm_curr === 0) return null;
    return gm_prev / gm_curr;
  })();

  // AQI: Asset Quality Index
  const aqi = (() => {
    if (!curr.totalAssets || !prev.totalAssets || curr.totalAssets <= 0 || prev.totalAssets <= 0) return null;
    const nca_curr = curr.totalAssets - (curr.ppe ?? 0) - (curr.currentAssets ?? 0);
    const nca_prev = prev.totalAssets - (prev.ppe ?? 0) - (prev.currentAssets ?? 0);
    const aq_curr = nca_curr / curr.totalAssets;
    const aq_prev = nca_prev / prev.totalAssets;
    return aq_prev !== 0 ? aq_curr / aq_prev : null;
  })();

  // SGI: Sales Growth Index
  const sgi = safe(curr.revenue, prev.revenue);

  // DEPI: Depreciation Index
  const depi = (() => {
    const dep_curr = curr.depreciation !== null && curr.ppe !== null && curr.ppe > 0 ? curr.depreciation / curr.ppe : null;
    const dep_prev = prev.depreciation !== null && prev.ppe !== null && prev.ppe > 0 ? prev.depreciation / prev.ppe : null;
    return dep_curr !== null && dep_prev !== null && dep_curr !== 0 ? dep_prev / dep_curr : null;
  })();

  // SGAI: SG&A Index
  const sgai = (() => {
    const sg_curr = curr.sga !== null && curr.revenue !== null && curr.revenue > 0 ? curr.sga / curr.revenue : null;
    const sg_prev = prev.sga !== null && prev.revenue !== null && prev.revenue > 0 ? prev.sga / prev.revenue : null;
    return safe(sg_curr, sg_prev);
  })();

  // LVGI: Leverage Index
  const lvgi = (() => {
    if (!curr.totalAssets || !prev.totalAssets) return null;
    const lev_curr = curr.totalLiabilities !== null ? curr.totalLiabilities / curr.totalAssets : null;
    const lev_prev = prev.totalLiabilities !== null ? prev.totalLiabilities / prev.totalAssets : null;
    return safe(lev_curr, lev_prev);
  })();

  // TATA: Total Accruals to Total Assets
  const tata = (() => {
    if (!curr.totalAssets || curr.totalAssets <= 0) return null;
    const wc = curr.currentAssets !== null && curr.currentLiabilities !== null
      ? curr.currentAssets - curr.currentLiabilities : null;
    const wc_prev = prev.currentAssets !== null && prev.currentLiabilities !== null
      ? prev.currentAssets - prev.currentLiabilities : null;
    if (wc === null || wc_prev === null || curr.depreciation === null) return null;
    const accruals = (wc - wc_prev) - curr.depreciation;
    return accruals / curr.totalAssets;
  })();

  const components = [dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata];
  if (components.some((c) => c === null)) return { score: null, manipulationProbability: null };

  const [d, g, a, s, dep, sg, lv, ta2] = components as [number, number, number, number, number, number, number, number];
  // Beneish (1999) formula: TATA coefficient is +4.679, LVGI is -0.327
  const m = -4.84 + 0.92 * d + 0.528 * g + 0.404 * a + 0.892 * s
    + 0.115 * dep - 0.172 * sg - 0.327 * lv + 4.679 * ta2;

  return {
    score: Number(m.toFixed(4)),
    manipulationProbability: m > -1.78 ? "high" : "low",
  };
}
