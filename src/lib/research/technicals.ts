import type { PricePoint } from "@/lib/schemas/dataset";
import { THRESHOLDS } from "@/lib/research/thresholds";

export interface TechnicalSeries {
  price: PricePoint[];
  benchmark: PricePoint[];
  sectorBenchmark: PricePoint[];
}

export interface TechnicalIndicators {
  sma50: number | null;
  sma200: number | null;
  ema50: number | null;
  ema200: number | null;
  priceVsMa200Pct: number | null;
  ma200SlopePct: number | null;
  position52wPct: number | null;
  distanceTo52wHighPct: number | null;
  rsi14: number | null;
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
    histogramPositive: boolean;
  };
  relativeStrength: {
    vsIndex1m: number | null;
    vsIndex3m: number | null;
    vsIndex6m: number | null;
    vsIndex12m: number | null;
    vsSector1m: number | null;
    vsSector3m: number | null;
    vsSector6m: number | null;
    vsSector12m: number | null;
  };
  atr: number | null;
  realizedVolatility: number | null;
  obvTrend: number | null;
  beta: number | null;
}

function closes(points: PricePoint[]): number[] {
  return points.map((p) => p.close);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const tail = values.slice(-period);
  return tail.reduce((s, v) => s + v, 0) / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let out = values[0] ?? null;
  if (out === null) return null;
  for (let i = 1; i < values.length; i += 1) {
    out = values[i]! * k + out * (1 - k);
  }
  return out;
}

function slopePct(values: number[], period: number): number | null {
  if (values.length < period + 1) return null;
  const prev = values[values.length - 1 - period];
  const cur = values[values.length - 1];
  if (!prev || prev === 0 || cur === undefined) return null;
  return cur / prev - 1;
}

function rsi(values: number[], period: number): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i]! - values[i - 1]!;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function returns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    if (prev > 0) out.push(cur / prev - 1);
  }
  return out;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function covariance(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i]! - meanA) * (b[i]! - meanB);
  return s / (a.length - 1);
}

function relStrength(company: number[], bench: number[], days: number): number | null {
  if (company.length <= days || bench.length <= days) return null;
  const c0 = company[company.length - 1 - days]!;
  const c1 = company[company.length - 1]!;
  const b0 = bench[bench.length - 1 - days]!;
  const b1 = bench[bench.length - 1]!;
  if (c0 <= 0 || b0 <= 0) return null;
  const rc = c1 / c0 - 1;
  const rb = b1 / b0 - 1;
  return rc - rb;
}

function computeAtr(points: PricePoint[], period: number): number | null {
  if (points.length < period + 1) return null;
  const closesOnly = closes(points);
  const trs: number[] = [];
  for (let i = 1; i < closesOnly.length; i += 1) {
    const prev = closesOnly[i - 1]!;
    const cur = closesOnly[i]!;
    trs.push(Math.abs(cur - prev));
  }
  const tail = trs.slice(-period);
  return tail.reduce((s, v) => s + v, 0) / tail.length;
}

function computeObvTrend(points: PricePoint[]): number | null {
  if (points.length < 20) return null;
  let obv = 0;
  const series: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const vol = cur.volume ?? 0;
    if (cur.close > prev.close) obv += vol;
    else if (cur.close < prev.close) obv -= vol;
    series.push(obv);
  }
  return slopePct(series, Math.min(20, series.length - 1));
}

export function computeTechnicals(series: TechnicalSeries): TechnicalIndicators {
  const price = closes(series.price);
  const benchmark = closes(series.benchmark);
  const sector = closes(series.sectorBenchmark);
  const latest = price.at(-1) ?? null;

  const sma50 = sma(price, THRESHOLDS.technical_sma_fast_days);
  const sma200 = sma(price, THRESHOLDS.technical_sma_slow_days);
  const ema50 = ema(price, THRESHOLDS.technical_ema_fast_days);
  const ema200 = ema(price, THRESHOLDS.technical_ema_slow_days);

  const lb = THRESHOLDS.technical_lookback_52w_days;
  const tail52w = price.slice(-lb);
  const low52 = tail52w.length > 0 ? Math.min(...tail52w) : null;
  const high52 = tail52w.length > 0 ? Math.max(...tail52w) : null;
  const position52wPct =
    latest !== null && low52 !== null && high52 !== null && high52 > low52
      ? ((latest - low52) / (high52 - low52)) * 100
      : null;
  const distanceTo52wHighPct = latest !== null && high52 !== null && high52 > 0 ? latest / high52 - 1 : null;

  const rsi14 = rsi(price, THRESHOLDS.technical_rsi_days);

  const macdFast = ema(price, THRESHOLDS.technical_macd_fast_days);
  const macdSlow = ema(price, THRESHOLDS.technical_macd_slow_days);
  const macdLine = macdFast !== null && macdSlow !== null ? macdFast - macdSlow : null;
  const macdSeries: number[] = [];
  for (let i = THRESHOLDS.technical_macd_slow_days; i < price.length; i += 1) {
    const slice = price.slice(0, i + 1);
    const f = ema(slice, THRESHOLDS.technical_macd_fast_days);
    const s = ema(slice, THRESHOLDS.technical_macd_slow_days);
    if (f !== null && s !== null) macdSeries.push(f - s);
  }
  const macdSignal = ema(macdSeries, THRESHOLDS.technical_macd_signal_days);
  const macdHist = macdLine !== null && macdSignal !== null ? macdLine - macdSignal : null;

  const returnsPrice = returns(price).slice(-THRESHOLDS.beta_window_days);
  const returnsBench = returns(benchmark).slice(-THRESHOLDS.beta_window_days);
  const minLen = Math.min(returnsPrice.length, returnsBench.length);
  const rp = returnsPrice.slice(-minLen);
  const rb = returnsBench.slice(-minLen);
  const beta = (() => {
    if (rp.length < 20) return null;
    const cov = covariance(rp, rb);
    const varB = stddev(rb);
    if (cov === null || varB === null || varB === 0) return null;
    return cov / (varB ** 2);
  })();

  return {
    sma50,
    sma200,
    ema50,
    ema200,
    priceVsMa200Pct: latest !== null && sma200 !== null && sma200 > 0 ? latest / sma200 - 1 : null,
    ma200SlopePct: slopePct(price, THRESHOLDS.technical_sma_slow_days),
    position52wPct,
    distanceTo52wHighPct,
    rsi14,
    macd: {
      line: macdLine,
      signal: macdSignal,
      histogram: macdHist,
      histogramPositive: (macdHist ?? 0) > 0,
    },
    relativeStrength: {
      vsIndex1m: relStrength(price, benchmark, THRESHOLDS.technical_rel_strength_1m_days),
      vsIndex3m: relStrength(price, benchmark, THRESHOLDS.technical_rel_strength_3m_days),
      vsIndex6m: relStrength(price, benchmark, THRESHOLDS.technical_rel_strength_6m_days),
      vsIndex12m: relStrength(price, benchmark, THRESHOLDS.technical_rel_strength_12m_days),
      vsSector1m: relStrength(price, sector, THRESHOLDS.technical_rel_strength_1m_days),
      vsSector3m: relStrength(price, sector, THRESHOLDS.technical_rel_strength_3m_days),
      vsSector6m: relStrength(price, sector, THRESHOLDS.technical_rel_strength_6m_days),
      vsSector12m: relStrength(price, sector, THRESHOLDS.technical_rel_strength_12m_days),
    },
    atr: computeAtr(series.price, THRESHOLDS.technical_atr_days),
    realizedVolatility: (() => {
      const rets = returns(price).slice(-THRESHOLDS.technical_realized_vol_days);
      const sd = stddev(rets);
      return sd !== null ? sd * Math.sqrt(252) : null;
    })(),
    obvTrend: computeObvTrend(series.price),
    beta,
  };
}
