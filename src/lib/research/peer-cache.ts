/**
 * Peer-Cache: Berechnet Perzentilränge und Winsorisierung für Peer-Vergleich.
 * Ergebnisse werden in SQLite gecacht (peer_metrics Tabelle, Phase B Migration).
 *
 * Wichtig: Wenn keine DB-Daten vorhanden, werden statische Medians aus peer-universe.ts
 * als Fallback verwendet (berechnet ad-hoc über PEER_BUCKETS).
 */

import type { KeyMetrics } from "@/lib/schemas/report";
import type { PeerBenchmark } from "./peer-universe";

export type PeerMetricKey = keyof PeerBenchmark["medians"];

export interface PeerPercentiles {
  bucketId: string;
  /** Welche Metrics wurden berechnet */
  computed: PeerMetricKey[];
  /** Percentile rank 0..100 gegenüber Peer-Medianen. */
  percentiles: Partial<Record<PeerMetricKey, number>>;
  /** Normalized z-score vs. Peer-Median (ohne stddev = rough delta). */
  vsMedian: Partial<Record<PeerMetricKey, number>>;
}

/**
 * Winsorisiert eine Zahlenreihe auf [p5, p95].
 * Schützt Percentile-Berechnung vor Ausreißern.
 */
export function winsorize(values: number[], lowerPct = 0.05, upperPct = 0.95): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * lowerPct)] ?? sorted[0]!;
  const hi = sorted[Math.floor(sorted.length * upperPct)] ?? sorted[sorted.length - 1]!;
  return values.map((v) => Math.min(Math.max(v, lo), hi));
}

/**
 * Berechnet den Percentile-Rang eines Wertes in einer Verteilung.
 * Verwendet lineare Interpolation (näher an Excel's PERCENTRANK.INC).
 *
 * @returns 0..100
 */
export function percentileRank(value: number, distribution: number[]): number {
  if (distribution.length === 0) return 50;
  const sorted = [...distribution].sort((a, b) => a - b);
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const rank = (below + 0.5 * equal) / sorted.length;
  return Math.round(rank * 100);
}

/**
 * Berechnet Peer-Percentile-Ränge für ein Unternehmen auf Basis
 * von statischen Benchmarks aus peer-universe.ts.
 *
 * Da wir keine echte Distribution von Peers haben, approximieren wir:
 *   - Percentile via sigmoid-ähnlicher Mapping gegen den Median
 *   - vsMedian = (company_value - median) / |median| (relative distance)
 *
 * Sobald Phase B DB-Integration aktiv ist, kann diese Funktion durch
 * echte Peer-Distributionen ersetzt werden.
 */
export function computePeerPercentiles(
  keyMetrics: Partial<KeyMetrics>,
  bucket: PeerBenchmark,
): PeerPercentiles {
  const METRIC_KEYS: PeerMetricKey[] = [
    "revenue_growth_yoy",
    "gross_margin",
    "operating_margin",
    "fcf_margin",
    "net_debt_to_ebitda",
    "roic",
    "ev_sales",
    "rule_of_40",
    "sbc_to_revenue",
    "piotroski_f",
  ];

  const percentiles: Partial<Record<PeerMetricKey, number>> = {};
  const vsMedian: Partial<Record<PeerMetricKey, number>> = {};
  const computed: PeerMetricKey[] = [];

  // Metrics where HIGHER is BETTER (higher percentile = better)
  const higherIsBetter = new Set<PeerMetricKey>([
    "revenue_growth_yoy",
    "gross_margin",
    "operating_margin",
    "fcf_margin",
    "roic",
    "rule_of_40",
    "piotroski_f",
  ]);
  // Metrics where LOWER is BETTER (higher percentile = worse)
  const lowerIsBetter = new Set<PeerMetricKey>([
    "net_debt_to_ebitda",
    "ev_sales",       // lower valuation multiple = cheaper
    "sbc_to_revenue",
  ]);

  for (const key of METRIC_KEYS) {
    const companyVal = keyMetrics[key as keyof KeyMetrics] as number | null | undefined;
    const median = bucket.medians[key];

    if (companyVal == null || median == null) continue;

    // vsMedian: relative difference
    const relDiff = median !== 0 ? (companyVal - median) / Math.abs(median) : 0;
    vsMedian[key] = Number(relDiff.toFixed(4));

    // Percentile approximation using sigmoid on relative difference
    // sigmoid maps [-∞,∞] → [0,100]
    // We use a stretch factor of 2.0 to give useful range for typical deviations
    const stretch = 2.0;
    const sigIn = relDiff * stretch;
    const sigOut = 1 / (1 + Math.exp(-sigIn));

    // Flip for lower-is-better metrics
    const rawPct = higherIsBetter.has(key)
      ? sigOut
      : lowerIsBetter.has(key)
        ? 1 - sigOut
        : 0.5;

    percentiles[key] = Math.round(rawPct * 100);
    computed.push(key);
  }

  return {
    bucketId: bucket.bucketId,
    computed,
    percentiles,
    vsMedian,
  };
}
