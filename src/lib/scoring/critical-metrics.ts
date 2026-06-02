import type { KeyMetrics } from "@/lib/schemas/report";
import type { Lens } from "@/lib/scoring/lenses";

const CRITICAL_BY_LENS: Record<Lens, Array<keyof KeyMetrics>> = {
  quality_compounder: [
    "roic",
    "altman_z",
    "gross_margin_trend",
    "operating_margin_trend",
    "fcf_margin_trend",
    "ev_sales",
  ],
  emerging_winner: [
    "revenue_growth_yoy",
    "rule_of_40",
    "net_debt_to_ebitda",
    "share_count_growth_yoy",
    "fcf_margin",
    "ev_sales",
  ],
  quality_garp: [
    "roic",
    "altman_z",
    "fcf_margin",
    "ev_fcf",
    "reverse_dcf_asymmetry",
    "fcf_peg",
  ],
};

export function getCriticalMetricsForLens(lens: Lens): Array<keyof KeyMetrics> {
  return CRITICAL_BY_LENS[lens];
}

export function evaluateCriticalCoverage(
  keyMetrics: Partial<KeyMetrics> | undefined,
  lens: Lens,
): { total: number; present: number; missing: string[]; coverage: number } {
  const critical = getCriticalMetricsForLens(lens);
  const missing = critical.filter((k) => {
    const v = keyMetrics?.[k];
    return typeof v !== "number" || !Number.isFinite(v);
  });
  const total = critical.length;
  const present = total - missing.length;
  return {
    total,
    present,
    missing: missing.map(String),
    coverage: total > 0 ? present / total : 1,
  };
}
