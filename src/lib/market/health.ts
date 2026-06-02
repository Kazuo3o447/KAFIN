/**
 * market/health.ts — Marktgesundheits-Synthese.
 *
 * Berechnet die Risk-Posture (0–100) aus drei bestätigenden Säulen:
 *   1. Volatilität (VIX + MOVE-Proxy)
 *   2. Credit (HY-Spread + z-Score 1J/3J + Trend)
 *   3. Breadth (% über MA200, A/D-Divergenz-Proxy via SPY vs. RSP)
 *
 * plus Zins-/Duration-Block (Realzins, ERP, Kurve) und Faktor-Regime.
 *
 * **Leitsatz:** Der Markt sagt *wie viel und wann*, nicht *ob das ein gutes Geschäft ist*.
 * Die Posture verändert NIEMALS Growth-/Finance-/Moat-Scores.
 *
 * Cache-Strategie: TTL 30 min während Handelszeiten, 60 min sonst.
 * Jeder Report stempelt das Ergebnis as-of.
 */

import { fredProviderV2 } from "@/lib/providers/fred";
import type { AssetQuote } from "@/lib/providers/market-quotes";
import { fetchMarketQuotes } from "@/lib/providers/market-quotes";
export type { AssetQuote } from "@/lib/providers/market-quotes";
import { THRESHOLDS } from "@/lib/research/thresholds";

// ------------------------------------------------------------
// Types (auch in /api/market/health als Response verwendet)
// ------------------------------------------------------------

export type PostureLabel = "risk_off" | "neutral" | "risk_on";

export interface PillarRead {
  state: PostureLabel;
  subscore: number; // 0..100
  inputs: Record<string, number | string | boolean | null>;
}

export interface MomentumComposite {
  price: {
    rs3m: number | null;
    rs6m: number | null;
    rs12m1m: number | null;
    riskAdjusted: number | null;
    trend: string; // "above_both_sma" | "between" | "below_both_sma"
    near52wHigh: number | null; // % from 52w high, negative = below high
  };
  earnings: {
    revisionBreadth: number | null;
    revisionMagnitude: number | null;
    sue: number | null;
    peadDrift: number | null;
  };
  breadth: {
    participation: number | null; // % of S&P members above MA200
  };
  score: number; // 0..100
}

export interface MarketHealth {
  asOf: string;
  posture: PostureLabel;
  score: number; // 0..100 — risk_off = low, risk_on = high
  pillars: {
    breadth: PillarRead;
    volatility: PillarRead;
    credit: PillarRead;
  };
  rates: {
    tenY: number | null;
    realTenY: number | null;
    erp: number | null;
    curve10y2y: number | null;
  };
  factor: {
    growthVsValueTrend: string;
    cyclicalVsDefensive: string;
    cape: number | null;
  };
  momentum: MomentumComposite | null;
  quotes: AssetQuote[];
  divergences: string[];
  /** 1-Satz-KI-Zusammenfassung; null wenn KI nicht verfügbar */
  summary: string | null;
  /** Säulenübereinstimmung: 0–3 wie viele Säulen dasselbe Signal zeigen */
  pillarAgreement: number;
}

// ------------------------------------------------------------
// In-Memory Cache
// ------------------------------------------------------------

interface CacheEntry {
  value: MarketHealth;
  expiresAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL_TRADING = 30 * 60 * 1000;  // 30 min
const CACHE_TTL_OFFHOURS = 60 * 60 * 1000; // 60 min

function isTradingHours(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  // NYSE trading hours approx 13:30–20:00 UTC (Mon–Fri)
  return day >= 1 && day <= 5 && hour >= 13 && hour < 20;
}

export function getMarketHealthCache(): MarketHealth | null {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.value;
  return null;
}

export function setMarketHealthCache(value: MarketHealth): void {
  const ttl = isTradingHours() ? CACHE_TTL_TRADING : CACHE_TTL_OFFHOURS;
  _cache = { value, expiresAt: Date.now() + ttl };
}

export function invalidateMarketHealthCache(): void {
  _cache = null;
}

// ------------------------------------------------------------
// Pillar scorers
// ------------------------------------------------------------

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function scoreVolatilityPillar(
  vix: number | null,
  vixPct1y: number | null,
  move: number | null
): PillarRead {
  let subscore = 50; // neutral default
  const inputs: Record<string, number | null> = { vix, vixPct1y, move };

  if (vix !== null) {
    // VIX > threshold → stress; use 0-100 inverse scale
    if (vix >= THRESHOLDS.market_vix_panic) subscore = 5;
    else if (vix >= 25) subscore = 25;
    else if (vix >= 20) subscore = 45;
    else if (vix >= 15) subscore = 65;
    else subscore = 80;
  }

  // MOVE stress pulls vol pillar down even if VIX is quiet
  if (move !== null && move >= THRESHOLDS.market_move_stress) {
    subscore = Math.min(subscore, 35);
    (inputs as Record<string, unknown>).moveStress = true;
  }

  // VIX percentile confirmation
  if (vixPct1y !== null) {
    if (vixPct1y >= 85) subscore = Math.min(subscore, 20);
    else if (vixPct1y <= 25) subscore = Math.max(subscore, 65);
  }

  subscore = clamp(subscore);
  const state: PostureLabel =
    subscore <= 30 ? "risk_off" : subscore >= 65 ? "risk_on" : "neutral";
  return { state, subscore, inputs };
}

function scoreCreditPillar(
  hySpread: number | null,
  hyZ1y: number | null,
  hyZ3y: number | null,
  igSpread: number | null
): PillarRead {
  let subscore = 50;
  const inputs: Record<string, number | null> = { hySpread, hyZ1y, hyZ3y, igSpread };

  if (hySpread !== null) {
    if (hySpread >= THRESHOLDS.regime_hy_spread_risk_off_min) subscore = 20;
    else if (hySpread >= THRESHOLDS.regime_hy_spread_risk_on_max) subscore = 45;
    else subscore = 75;
  }

  // z-Score overrides — credit leads equities
  if (hyZ1y !== null) {
    if (hyZ1y >= THRESHOLDS.market_hy_zScore_stress) subscore = Math.min(subscore, 15);
    else if (hyZ1y >= 1.0) subscore = Math.min(subscore, 35);
    else if (hyZ1y <= -1.0) subscore = Math.max(subscore, 65);
  }
  if (hyZ3y !== null) {
    if (hyZ3y >= THRESHOLDS.market_hy_zScore_stress) subscore = Math.min(subscore, 20);
  }

  subscore = clamp(subscore);
  const state: PostureLabel =
    subscore <= 30 ? "risk_off" : subscore >= 65 ? "risk_on" : "neutral";
  return { state, subscore, inputs };
}

function scoreBreadthPillar(
  pctAboveMa200: number | null,
  spy: AssetQuote | null,
  rsp: AssetQuote | null // equal-weight proxy for breadth
): PillarRead {
  let subscore = 50;
  const divergence =
    spy?.change1dPct != null &&
    rsp?.change1dPct != null &&
    // index up but equal-weight down → breadth divergence
    spy.change1dPct > 0.005 &&
    rsp.change1dPct < -0.001;

  const inputs: Record<string, number | boolean | null> = {
    pctAboveMa200,
    spyChange1dPct: spy?.change1dPct ?? null,
    rspChange1dPct: rsp?.change1dPct ?? null,
    breadthDivergence: divergence,
  };

  if (pctAboveMa200 !== null) {
    if (pctAboveMa200 >= THRESHOLDS.regime_breadth_risk_on_min) subscore = 75;
    else if (pctAboveMa200 <= THRESHOLDS.regime_breadth_risk_off_max) subscore = 25;
    else subscore = 50 + (pctAboveMa200 - 0.5) * 100; // linear interpolation
  }

  // Breadth divergence is a Frühwarnung — floor the subscore
  if (divergence) subscore = Math.min(subscore, 40);

  subscore = clamp(subscore);
  const state: PostureLabel =
    subscore <= 30 ? "risk_off" : subscore >= 65 ? "risk_on" : "neutral";
  return { state, subscore, inputs };
}

function postureFromScore(score: number): PostureLabel {
  if (score <= 33) return "risk_off";
  if (score >= 60) return "risk_on";
  return "neutral";
}

function detectDivergences(
  pillars: { breadth: PillarRead; volatility: PillarRead; credit: PillarRead },
  quotes: AssetQuote[]
): string[] {
  const divergences: string[] = [];

  // Breadth divergence from pillar inputs
  const breadthDiv = pillars.breadth.inputs["breadthDivergence"];
  if (breadthDiv === true) {
    divergences.push("Index-Kursanstieg ohne Breiten-Bestätigung (Marktbreite divergiert)");
  }

  // Vol/Credit disagree
  if (
    pillars.volatility.state === "risk_on" &&
    pillars.credit.state === "risk_off"
  ) {
    divergences.push("Credit-Stress während niedriger Equity-Vol (MOVE/HY warnt früher)");
  }

  // MOVE stress without VIX panic
  const move = pillars.volatility.inputs["move"];
  const vix = pillars.volatility.inputs["vix"];
  if (
    typeof move === "number" &&
    typeof vix === "number" &&
    move >= THRESHOLDS.market_move_stress &&
    vix < 20
  ) {
    divergences.push("Zins-Vol (MOVE) hoch bei niedriger Equity-Vol — Duration-Risiko");
  }

  // SPX vs Russell divergence
  const spx = quotes.find((q) => q.symbol === "^GSPC");
  const rut = quotes.find((q) => q.symbol === "^RUT");
  if (
    spx?.change1dPct != null &&
    rut?.change1dPct != null &&
    spx.change1dPct > 0.005 &&
    rut.change1dPct < -0.005
  ) {
    divergences.push("Large-Cap-Anstieg ohne Small-Cap-Bestätigung (Qualitätsflucht)");
  }

  return divergences;
}

// ------------------------------------------------------------
// Main compute function
// ------------------------------------------------------------

export interface MarketHealthInput {
  /** Ergebnis des FRED-Provider-Calls (data-Feld) */
  fredData: {
    highYieldSpread: number | null;
    highYieldSpreadZScore1y: number | null;
    highYieldSpreadZScore3y: number | null;
    igSpread: number | null;
    yieldCurve10y2y: number | null;
    vix: number | null;
    vixPercentile1y: number | null;
    tenYNominal: number | null;
    tenYReal: number | null;
    erp: number | null;
    asOf: string;
  } | null;
  quotes: AssetQuote[];
  /** Breadth aus bestehenden Provider-Daten (falls vorhanden) */
  breadthPctAboveMa200?: number | null;
  /** ERP aus Fundamental-Daten (1/forward_PE – realTenY), optional */
  erpOverride?: number | null;
  asOf?: string;
}

export function computeMarketHealth(input: MarketHealthInput): MarketHealth {
  const { fredData, quotes } = input;
  const asOf = input.asOf ?? fredData?.asOf ?? new Date().toISOString().slice(0, 10);

  // Extract quote helpers
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const spy = bySymbol.get("^GSPC") ?? null;
  const rsp = bySymbol.get("RSP") ?? null; // optional equal-weight S&P
  const vixQuote = bySymbol.get("^VIX");
  const moveQuote = bySymbol.get("^MOVE");

  // Use FRED as primary VIX source; fall back to Yahoo quote
  const vix = fredData?.vix ?? vixQuote?.price ?? null;
  const vixPct1y = fredData?.vixPercentile1y ?? null;
  const move = moveQuote?.price ?? null;

  const hySpread = fredData?.highYieldSpread ?? null;
  const hyZ1y = fredData?.highYieldSpreadZScore1y ?? null;
  const hyZ3y = fredData?.highYieldSpreadZScore3y ?? null;
  const igSpread = fredData?.igSpread ?? null;

  const breadth = input.breadthPctAboveMa200 ?? null;

  // Breadth-Proxy aus SPX MA200-Lage (wenn keine externe Breadth-Daten vorliegen)
  const breadthFromMa200 =
    breadth ??
    (spy?.maTrend != null
      ? spy.maTrend === "above_both"
        ? 0.65   // Index über beiden MAs → Breadth-Proxy eher positiv
        : spy.maTrend === "below_both"
        ? 0.35
        : 0.5
      : null);

  // Score pillars
  const volatilityPillar = scoreVolatilityPillar(vix, vixPct1y, move);
  const creditPillar = scoreCreditPillar(hySpread, hyZ1y, hyZ3y, igSpread);
  const breadthPillar = scoreBreadthPillar(breadthFromMa200, spy, rsp);

  // Consensus rule: if all three point same direction → strongest signal
  const pillarStates = [volatilityPillar.state, creditPillar.state, breadthPillar.state];
  const pillarAgreement = Math.max(
    pillarStates.filter((s) => s === "risk_on").length,
    pillarStates.filter((s) => s === "risk_off").length
  );

  // Weighted blend: vol 30%, credit 35%, breadth 35%
  const rawScore =
    volatilityPillar.subscore * 0.3 +
    creditPillar.subscore * 0.35 +
    breadthPillar.subscore * 0.35;

  // Rates modifier: steep inversion → -5; real yield > 2.5% → -5
  let rateAdj = 0;
  const curve = fredData?.yieldCurve10y2y ?? null;
  const realY = fredData?.tenYReal ?? null;
  if (curve !== null && curve < -0.5) rateAdj -= 5;
  if (realY !== null && realY > 2.5) rateAdj -= 5;
  // Positive curve and real yield < 0 → slight boost
  if (curve !== null && curve > 0.5) rateAdj += 3;

  const score = clamp(rawScore + rateAdj);

  // ERP: use override or compute from fredData if available
  const erp =
    input.erpOverride ??
    (fredData?.erp != null
      ? fredData.erp
      : fredData?.tenYReal != null && fredData.tenYReal > 0
      ? null
      : null);

  // Factor regime — derived from growth vs. value ETFs if available
  const qqqChange = bySymbol.get("QQQ")?.change1dPct ?? null;
  const ixlvChange = bySymbol.get("IVE")?.change1dPct ?? null; // S&P value ETF
  const xlkChange = bySymbol.get("XLK")?.change1dPct ?? null;
  const xluChange = bySymbol.get("XLU")?.change1dPct ?? null;

  const growthVsValueTrend =
    qqqChange != null && ixlvChange != null
      ? qqqChange > ixlvChange + 0.003
        ? "growth_leading"
        : ixlvChange > qqqChange + 0.003
        ? "value_leading"
        : "neutral"
      : "data_unavailable";

  const cyclicalVsDefensive =
    xlkChange != null && xluChange != null
      ? xlkChange > xluChange + 0.003
        ? "cyclical_leading"
        : xluChange > xlkChange + 0.003
        ? "defensive_leading"
        : "neutral"
      : "data_unavailable";

  const divergences = detectDivergences(
    { breadth: breadthPillar, volatility: volatilityPillar, credit: creditPillar },
    quotes
  );

  // Momentum-Composite aus verfügbaren Quote-Daten
  // Preis-RS: 52w-Hoch-Nähe + MA-Trend (Proxy, bis historische Returns via FMP/Yahoo-Chart vorliegen)
  const spxQuote = bySymbol.get("^GSPC") ?? null;
  const near52wHigh =
    spxQuote?.price != null && spxQuote.high52w != null && spxQuote.high52w > 0
      ? ((spxQuote.price - spxQuote.high52w) / spxQuote.high52w) * 100
      : null;

  const maTrendScore =
    spxQuote?.maTrend === "above_both" ? 75
    : spxQuote?.maTrend === "between"  ? 50
    : spxQuote?.maTrend === "below_both" ? 25
    : null;

  // 1d-RS SPX vs. RSP (Breadth-Proxy für Tagesmomentum)
  const rsDay =
    spy?.change1dPct != null && rsp?.change1dPct != null
      ? spy.change1dPct - rsp.change1dPct
      : null;

  const momentumScore = clamp(
    (maTrendScore ?? 50) +
    (rsDay != null ? (rsDay > 0 ? 5 : rsDay < 0 ? -5 : 0) : 0)
  );

  const momentum: MomentumComposite = {
    price: {
      rs3m: null,     // benötigt historische Daten (FMP/Yahoo Chart-API)
      rs6m: null,
      rs12m1m: null,
      riskAdjusted: null,
      trend: spxQuote?.maTrend ?? "data_unavailable",
      near52wHigh,
    },
    earnings: {
      revisionBreadth: null,  // benötigt FMP Financial Estimates
      revisionMagnitude: null,
      sue: null,
      peadDrift: null,
    },
    breadth: {
      participation: breadth,
    },
    score: momentumScore,
  };

  return {
    asOf,
    posture: postureFromScore(score),
    score: Math.round(score),
    pillars: {
      breadth: breadthPillar,
      volatility: volatilityPillar,
      credit: creditPillar,
    },
    rates: {
      tenY: fredData?.tenYNominal ?? null,
      realTenY: fredData?.tenYReal ?? null,
      erp,
      curve10y2y: curve,
    },
    factor: {
      growthVsValueTrend,
      cyclicalVsDefensive,
      cape: null, // populated by KI if available
    },
    momentum,
    quotes,
    divergences,
    summary: null, // populated by /api/market/analyze
    pillarAgreement,
  };
}

// ------------------------------------------------------------
// Full fetch + compute pipeline (called by API route)
// ------------------------------------------------------------

export async function fetchAndComputeMarketHealth(
  breadthPctAboveMa200?: number | null
): Promise<MarketHealth> {
  // Check cache first
  const cached = getMarketHealthCache();
  if (cached) return cached;

  const asOf = new Date().toISOString().slice(0, 10);

  // Fetch in parallel
  const [quotesResult, fredResult] = await Promise.allSettled([
    fetchMarketQuotes(),
    fredProviderV2.fetch("macro", { ticker: "_market", runDate: asOf }),
  ]);

  const quotes = quotesResult.status === "fulfilled" ? quotesResult.value : [];
  const fredData =
    fredResult.status === "fulfilled" && fredResult.value.ok
      ? (fredResult.value.data as MarketHealthInput["fredData"])
      : null;

  const health = computeMarketHealth({
    fredData,
    quotes,
    breadthPctAboveMa200: breadthPctAboveMa200 ?? null,
    asOf,
  });

  setMarketHealthCache(health);
  return health;
}
