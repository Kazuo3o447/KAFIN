import type { KeyMetrics } from "@/lib/schemas/report";

export interface RationaleConsistencyIssue {
  id: string;
  issue: string;
}

const CONSISTENCY_RULES = [
  {
    id: "roic_wacc_requires_roic",
    pattern: /roic\s*>\s*wacc|return.*above.*wacc/i,
    check: (km: KeyMetrics) =>
      km.roic != null && km.roic_wacc_spread != null
        ? null
        : "Rationale claims ROIC > WACC but ROIC or ROIC-WACC spread is missing.",
  },
  {
    id: "high_beta_threshold",
    pattern: /high beta|hoh.+beta/i,
    check: (km: KeyMetrics) =>
      km.beta == null ? "Rationale claims beta risk but beta is missing." : km.beta > 1.2 ? null : `Rationale claims high beta but beta=${km.beta}.`,
  },
  {
    id: "dilution_requires_share_count_growth",
    pattern: /dilution|verwässer|verwaess|share count/i,
    check: (km: KeyMetrics) =>
      km.share_count_growth_yoy == null ? "Rationale discusses dilution but share_count_growth_yoy is missing." : null,
  },
  {
    id: "high_sbc_threshold",
    pattern: /high sbc|hohe sbc|sbc.*high/i,
    check: (km: KeyMetrics) =>
      km.sbc_to_revenue == null
        ? "Rationale claims SBC burden but sbc_to_revenue is missing."
        : km.sbc_to_revenue > 0.1
          ? null
          : `Rationale claims high SBC but sbc_to_revenue=${km.sbc_to_revenue}.`,
  },
] as const;

export function findRationaleConsistencyIssues(rationale: string, km: KeyMetrics): RationaleConsistencyIssue[] {
  const out: RationaleConsistencyIssue[] = [];
  for (const rule of CONSISTENCY_RULES) {
    if (!rule.pattern.test(rationale)) continue;
    const issue = rule.check(km);
    if (!issue) continue;
    out.push({ id: rule.id, issue });
  }
  return out;
}
