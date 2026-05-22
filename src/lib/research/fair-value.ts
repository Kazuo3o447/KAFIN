/**
 * Fair-Value-Engine (Phase F.1).
 * Drei-Methoden-Korb: EV/Sales, EV/Gross Profit, Forward P/E — jeweils peer-adjustiert.
 * Kein Kursziel. Kein Buy/Sell. Nur Modellschätzung.
 *
 * research.md §39
 */
import type { KeyMetrics } from "@/lib/schemas/report";
import type { BusinessModelType } from "@/lib/research/business-model";

export type FairValueMethodKey = "ev_sales" | "ev_gross_profit" | "forward_pe";

export interface FairValueMethodResult {
  name: FairValueMethodKey;
  applicable: boolean;
  value: number | null;          // in price units (same currency as input)
  weight: number;                // 0..1
  confidence: "low" | "medium" | "high";
  rationale: string;             // ≤ 90 Zeichen
  inputs: Record<string, number | null>;
}

export interface FairValueReverseDcfCheck {
  implied_fcf_cagr: number | null;
  terminal_growth: number;
  horizon_years: number;
  classification: "conservative" | "fair" | "ambitious" | "extreme" | null;
}

export type FairValueClassification =
  | "deep_value"   // current < range_low - 15%
  | "value"        // current in [range_low - 15%, range_low]
  | "fair"         // current in [range_low, range_high]
  | "premium"      // current in [range_high, range_high + 15%]
  | "overvalued";  // current > range_high + 15%

export interface FairValueResult {
  currency: string;
  current_price: number | null;
  point_estimate: number | null;
  range_low: number | null;
  range_high: number | null;
  upside_pct: number | null;
  classification: FairValueClassification | null;
  methods: FairValueMethodResult[];
  reverse_dcf: FairValueReverseDcfCheck | null;
  confidence: "low" | "medium" | "high";
  applicable_method_count: number;
  rationale_short: string;      // ≤ 120 Zeichen
  asof: string;
}

export interface FairValuePeerMedians {
  ev_sales: number | null;
  ev_gross_profit: number | null;
  forward_pe: number | null;
  revenue_growth_yoy: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
}

export interface FairValueInput {
  ticker: string;
  currency: string;
  currentPrice: number | null;
  asof: string;
  keyMetrics: Partial<KeyMetrics>;
  businessModel: BusinessModelType;
  peerMedians: FairValuePeerMedians;
  reverseDcf?: FairValueReverseDcfCheck | null;
  netDebt: number | null;
  sharesOutstanding: number | null;
  /** Explicit TTM revenue (preferred). If omitted, engine falls back to currentEV/ev_sales. */
  revenueTtm?: number | null;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function clamp(val: number, lo: number, hi: number): number {
  return Math.min(Math.max(val, lo), hi);
}

function simpleQuantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  const pairs = values.map((v, i) => ({ v, w: weights[i] ?? 1 }));
  pairs.sort((a, b) => a.v - b.v);
  const totalWeight = pairs.reduce((s, p) => s + p.w, 0);
  let cumWeight = 0;
  for (const pair of pairs) {
    cumWeight += pair.w;
    if (cumWeight >= totalWeight / 2) return pair.v;
  }
  return pairs[pairs.length - 1]!.v;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/** Imputed current EV from price × shares + netDebt */
function currentEV(input: FairValueInput): number | null {
  const { currentPrice, sharesOutstanding, netDebt } = input;
  if (currentPrice === null || sharesOutstanding === null || sharesOutstanding <= 0) return null;
  const mktCap = currentPrice * sharesOutstanding;
  return mktCap + (netDebt ?? 0);
}

/** Revenue TTM — explicit input preferred; fallback via currentEV / ev_sales */
function revenueTTM(input: FairValueInput): number | null {
  if (input.revenueTtm != null && input.revenueTtm > 0) return input.revenueTtm;
  const ev = currentEV(input);
  const evSales = input.keyMetrics.ev_sales ?? null;
  if (ev === null || evSales === null || evSales <= 0) return null;
  return ev / evSales;
}

// ─── Method 1: EV/Sales (growth-adjusted) ────────────────────────────────────

function computeEvSales(input: FairValueInput): FairValueMethodResult {
  const { peerMedians, keyMetrics, netDebt, sharesOutstanding } = input;
  const peer_multiple = peerMedians.ev_sales;
  const rev = revenueTTM(input);
  const shares = sharesOutstanding;

  if (peer_multiple === null || rev === null || rev <= 0 || shares === null || shares <= 0) {
    return {
      name: "ev_sales",
      applicable: false,
      value: null,
      weight: 0,
      confidence: "low",
      rationale: "Nicht anwendbar: fehlende Peer-Daten oder Revenue",
      inputs: { peer_multiple, revenue_ttm: rev, shares },
    };
  }

  const ownGrowth = keyMetrics.revenue_growth_yoy ?? null;
  const peerGrowth = peerMedians.revenue_growth_yoy;
  let growth_adjust = 1.0;
  let confidence: "low" | "medium" | "high" = "high";
  if (peerGrowth === null || peerGrowth <= 0 || ownGrowth === null) {
    growth_adjust = 1.0;
    confidence = "medium";
  } else {
    growth_adjust = clamp(ownGrowth / peerGrowth, 0.6, 1.6);
  }

  const adjusted_multiple = peer_multiple * growth_adjust;
  const implied_ev = adjusted_multiple * rev;
  const implied_equity = implied_ev - (netDebt ?? 0);
  const value = implied_equity / shares;

  const rationale = `EV/Sales ${peer_multiple.toFixed(1)}× adj ${growth_adjust.toFixed(2)} → $${value.toFixed(0)}/Aktie`.slice(0, 90);

  return {
    name: "ev_sales",
    applicable: true,
    value: Number(value.toFixed(2)),
    weight: confidence === "high" ? 1.0 : 0.7,
    confidence,
    rationale,
    inputs: {
      peer_multiple,
      growth_adjust: Number(growth_adjust.toFixed(3)),
      adjusted_multiple: Number(adjusted_multiple.toFixed(2)),
      revenue_ttm: Number(rev.toFixed(0)),
      implied_ev: Number(implied_ev.toFixed(0)),
      net_debt: netDebt,
      shares,
    },
  };
}

// ─── Method 2: EV/Gross Profit (margin-adjusted) ─────────────────────────────

function computeEvGrossProfit(input: FairValueInput): FairValueMethodResult {
  const { peerMedians, keyMetrics, netDebt, sharesOutstanding } = input;
  const peer_multiple = peerMedians.ev_gross_profit;
  const rev = revenueTTM(input);
  const gross_margin = keyMetrics.gross_margin ?? null;
  const shares = sharesOutstanding;

  if (
    peer_multiple === null ||
    rev === null ||
    rev <= 0 ||
    gross_margin === null ||
    gross_margin <= 0 ||
    shares === null ||
    shares <= 0
  ) {
    return {
      name: "ev_gross_profit",
      applicable: false,
      value: null,
      weight: 0,
      confidence: "low",
      rationale: "Nicht anwendbar: fehlende Peer-Daten, Gross Profit negativ oder Daten fehlen",
      inputs: { peer_multiple, revenue_ttm: rev, gross_margin, shares },
    };
  }

  const gross_profit_ttm = rev * gross_margin;
  if (gross_profit_ttm <= 0) {
    return {
      name: "ev_gross_profit",
      applicable: false,
      value: null,
      weight: 0,
      confidence: "low",
      rationale: "Nicht anwendbar: Gross Profit TTM negativ",
      inputs: { peer_multiple, gross_profit_ttm: Number(gross_profit_ttm.toFixed(0)), shares },
    };
  }

  const peerGrossMargin = peerMedians.gross_margin;
  let margin_adjust = 1.0;
  let confidence: "low" | "medium" | "high" = "high";
  if (peerGrossMargin === null || peerGrossMargin <= 0) {
    margin_adjust = 1.0;
    confidence = "medium";
  } else {
    margin_adjust = clamp(gross_margin / peerGrossMargin, 0.7, 1.4);
  }

  const adjusted_multiple = peer_multiple * margin_adjust;
  const implied_ev = adjusted_multiple * gross_profit_ttm;
  const implied_equity = implied_ev - (netDebt ?? 0);
  const value = implied_equity / shares;

  const rationale = `EV/GP ${peer_multiple.toFixed(1)}× adj ${margin_adjust.toFixed(2)} → $${value.toFixed(0)}/Aktie`.slice(0, 90);

  return {
    name: "ev_gross_profit",
    applicable: true,
    value: Number(value.toFixed(2)),
    weight: confidence === "high" ? 1.0 : 0.7,
    confidence,
    rationale,
    inputs: {
      peer_multiple,
      gross_profit_ttm: Number(gross_profit_ttm.toFixed(0)),
      margin_adjust: Number(margin_adjust.toFixed(3)),
      adjusted_multiple: Number(adjusted_multiple.toFixed(2)),
      net_debt: netDebt,
      shares,
    },
  };
}

// ─── Method 3: Forward P/E (PEG-adjusted) ────────────────────────────────────

function computeForwardPE(input: FairValueInput): FairValueMethodResult {
  const { peerMedians, keyMetrics, currentPrice } = input;
  const ntm_pe = keyMetrics.ntm_pe ?? null;
  const peer_multiple = peerMedians.forward_pe;
  const price = currentPrice;

  if (
    ntm_pe === null ||
    ntm_pe <= 0 ||
    peer_multiple === null ||
    price === null ||
    price <= 0
  ) {
    return {
      name: "forward_pe",
      applicable: false,
      value: null,
      weight: 0,
      confidence: "low",
      rationale: "Nicht anwendbar: negative Forward-Earnings oder fehlende Peer-Daten",
      inputs: { ntm_pe, peer_multiple, current_price: price },
    };
  }

  const ntm_eps = price / ntm_pe;
  const ownGrowth = keyMetrics.revenue_growth_yoy ?? null;
  let peg_adjust = 1.0;
  let confidence: "low" | "medium" | "high" = "high";
  if (ownGrowth === null) {
    peg_adjust = 1.0;
    confidence = "medium";
  } else {
    peg_adjust = clamp(ownGrowth / 0.10, 0.7, 1.5);
  }

  const adjusted_multiple = peer_multiple * peg_adjust;
  const value = adjusted_multiple * ntm_eps;

  const rationale = `Fwd P/E ${peer_multiple.toFixed(1)}× PEG-adj ${peg_adjust.toFixed(2)} → $${value.toFixed(0)}/Aktie`.slice(0, 90);

  return {
    name: "forward_pe",
    applicable: true,
    value: Number(value.toFixed(2)),
    weight: confidence === "high" ? 1.0 : 0.7,
    confidence,
    rationale,
    inputs: {
      ntm_pe,
      ntm_eps: Number(ntm_eps.toFixed(4)),
      peer_multiple,
      peg_adjust: Number(peg_adjust.toFixed(3)),
      adjusted_multiple: Number(adjusted_multiple.toFixed(2)),
    },
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

function classify(
  current: number,
  low: number,
  high: number,
): FairValueClassification {
  const lowFloor = low * 0.85;
  const highCeil = high * 1.15;
  if (current < lowFloor) return "deep_value";
  if (current <= low) return "value";
  if (current <= high) return "fair";
  if (current <= highCeil) return "premium";
  return "overvalued";
}

// ─── Rationale builder (deterministic, ≤ 120 chars) ─────────────────────────

function buildRationale(
  methodCount: number,
  methodNames: string[],
  cv: number | null,
  confidence: "low" | "medium" | "high",
  hasPeerMismatch: boolean,
): string {
  const names = methodNames.join(", ");
  const cvStr = cv !== null ? `Streuung ${(cv * 100).toFixed(0)}%.` : "Nur 1 Methode.";
  const confStr = `Confidence ${confidence}.`;
  const mismatch = hasPeerMismatch ? " Currency-Mismatch-Warnung." : "";
  return `Aggregat aus ${methodCount} Methode(n) (${names}). ${cvStr} ${confStr}${mismatch}`.slice(0, 120);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeFairValue(input: FairValueInput): FairValueResult {
  const methods: FairValueMethodResult[] = [
    computeEvSales(input),
    computeEvGrossProfit(input),
    computeForwardPE(input),
  ];

  const applicable = methods.filter((m) => m.applicable && m.value !== null);

  // Detect currency mismatch heuristic (no cross-rate available; flag if currency ≠ USD)
  // Only warn — don't block the engine
  const hasPeerMismatch = input.currency !== "USD" && input.peerMedians.ev_sales !== null;

  // No applicable methods
  if (applicable.length === 0) {
    return {
      currency: input.currency,
      current_price: input.currentPrice,
      point_estimate: null,
      range_low: null,
      range_high: null,
      upside_pct: null,
      classification: null,
      methods,
      reverse_dcf: input.reverseDcf ?? null,
      confidence: "low",
      applicable_method_count: 0,
      rationale_short: "Keine Methode anwendbar (fehlende Peer-Daten oder Bilanzgrößen).",
      asof: input.asof,
    };
  }

  const values = applicable.map((m) => m.value as number);
  const weights = applicable.map((m) => (m.confidence === "high" ? 1.0 : m.confidence === "medium" ? 0.7 : 0.4));

  const point_estimate = Number(weightedMedian(values, weights).toFixed(2));

  let range_low: number;
  let range_high: number;

  if (applicable.length === 1) {
    // Artificial ±8% range for single-method
    range_low = Number((point_estimate * 0.92).toFixed(2));
    range_high = Number((point_estimate * 1.08).toFixed(2));
  } else {
    range_low = Number(simpleQuantile(values, 0.25).toFixed(2));
    range_high = Number(simpleQuantile(values, 0.75).toFixed(2));
  }

  // Confidence heuristic
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const cv = mean !== 0 ? stddev(values) / Math.abs(mean) : null;
  let confidence: "low" | "medium" | "high";

  if (applicable.length >= 3 && cv !== null && cv < 0.10) {
    confidence = "high";
  } else if (applicable.length >= 2 && cv !== null && cv < 0.20) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Enforce low confidence when peer data missing or currency mismatch
  if (input.peerMedians.ev_sales === null || hasPeerMismatch) {
    confidence = "low";
  }
  // Single method also forces low
  if (applicable.length === 1) {
    confidence = "low";
  }

  const upside_pct =
    input.currentPrice !== null && input.currentPrice > 0
      ? Number(((point_estimate - input.currentPrice) / input.currentPrice).toFixed(4))
      : null;

  const classification =
    input.currentPrice !== null && input.currentPrice > 0
      ? classify(input.currentPrice, range_low, range_high)
      : null;

  const methodNames = applicable.map((m) => {
    if (m.name === "ev_sales") return "EV/Sales";
    if (m.name === "ev_gross_profit") return "EV/GP";
    return "Fwd P/E";
  });

  const rationale_short = buildRationale(
    applicable.length,
    methodNames,
    applicable.length > 1 ? cv : null,
    confidence,
    hasPeerMismatch,
  );

  return {
    currency: input.currency,
    current_price: input.currentPrice,
    point_estimate,
    range_low,
    range_high,
    upside_pct,
    classification,
    methods,
    reverse_dcf: input.reverseDcf ?? null,
    confidence,
    applicable_method_count: applicable.length,
    rationale_short,
    asof: input.asof,
  };
}
