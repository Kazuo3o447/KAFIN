import type { KeyMetrics } from "@/lib/schemas/report";

export interface GuidanceLike {
  revenue_growth_fy_midpoint?: number | null;
  revenue_growth_next_q_midpoint?: number | null;
}

interface SummaryRule {
  id: string;
  pattern: RegExp;
  validate: (ctx: { km: KeyMetrics; guidance?: GuidanceLike | null; debt?: { net_cash_after_interest_bearing_debt?: number | null } | null }) => boolean;
  replacement: string;
}

const SUMMARY_FORBIDDEN_CLAIMS: SummaryRule[] = [
  {
    id: "strong_growth_claim",
    pattern: /strong growth|rapid growth|starkes wachstum|high growth/i,
    validate: ({ km, guidance }) => {
      const ttm = km.revenue_growth_yoy ?? null;
      const latest = km.revenue_growth_latest_q ?? null;
      const guide = guidance?.revenue_growth_fy_midpoint ?? null;
      if ((ttm ?? -Infinity) >= 0.15) return true;
      if ((latest ?? -Infinity) >= 0.2) return true;
      if ((guide ?? -Infinity) >= 0.2) return true;
      return false;
    },
    replacement:
      "TTM revenue growth is low; the bull case depends on measurable re-acceleration in upcoming quarters.",
  },
  {
    id: "high_sbc_claim",
    pattern: /high sbc|sbc burden/i,
    validate: ({ km }) => km.sbc_to_revenue != null && km.sbc_to_revenue > 0.1,
    replacement:
      "SBC is not high on current SBC/Revenue; dilution still requires share-count trend verification.",
  },
  {
    id: "net_cash_claim_requires_breakdown",
    pattern: /net cash|netto-cash/i,
    validate: ({ debt }) => debt?.net_cash_after_interest_bearing_debt != null,
    replacement:
      "Debt position requires component-level validation before classifying net cash or net debt.",
  },
];

export function sanitizeSummaryClaims(
  bullets: string[],
  ctx: { km: KeyMetrics; guidance?: GuidanceLike | null; debt?: { net_cash_after_interest_bearing_debt?: number | null } | null },
): { sanitized: string[]; issues: string[] } {
  const issues: string[] = [];
  const sanitized = bullets.map((line) => {
    let out = line;
    for (const rule of SUMMARY_FORBIDDEN_CLAIMS) {
      if (!rule.pattern.test(out)) continue;
      if (rule.validate(ctx)) continue;
      issues.push(`${rule.id}: ${line}`);
      out = rule.replacement;
    }
    return out;
  });
  return { sanitized, issues };
}
