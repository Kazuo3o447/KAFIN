import type { BlockId } from "@/lib/llm/prompts";
import type { KeyMetrics } from "@/lib/schemas/report";
import type { DataCoverage } from "@/lib/scoring/confidence-cap";

export interface HardBlocker {
  id: string;
  label: string;
  severity: "hard" | "soft";
  canonicalBlock: BlockId;
  evidence: Array<{
    metric: string;
    value: number | string | null;
    threshold?: number | string;
  }>;
  reason: string;
}

export function evaluateHardBlockers(input: { km: KeyMetrics; coverage: DataCoverage }): HardBlocker[] {
  const out: HardBlocker[] = [];
  const { km } = input;

  if (
    km.operating_margin != null &&
    km.operating_margin < -0.1 &&
    km.fcf_margin != null &&
    km.fcf_margin < 0 &&
    km.cash_runway_months != null &&
    km.cash_runway_months < 12
  ) {
    out.push({
      id: "profitability_liquidity_trap",
      label: "Negative operating margin plus negative FCF and short runway",
      severity: "hard",
      canonicalBlock: "unit_economics_margins",
      evidence: [
        { metric: "operating_margin", value: km.operating_margin, threshold: -0.1 },
        { metric: "fcf_margin", value: km.fcf_margin, threshold: 0 },
        { metric: "cash_runway_months", value: km.cash_runway_months, threshold: 12 },
      ],
      reason: "Combined profitability and liquidity stress.",
    });
  }

  if (
    km.share_count_growth_yoy != null &&
    km.share_count_growth_yoy > 0.05 &&
    km.fcf_margin != null &&
    km.fcf_margin < 0 &&
    km.net_debt_to_ebitda != null &&
    km.net_debt_to_ebitda > 3
  ) {
    out.push({
      id: "dilution_debt_burn",
      label: "Dilution plus cash burn plus leverage",
      severity: "hard",
      canonicalBlock: "capital_discipline_dilution",
      evidence: [
        { metric: "share_count_growth_yoy", value: km.share_count_growth_yoy, threshold: 0.05 },
        { metric: "fcf_margin", value: km.fcf_margin, threshold: 0 },
        { metric: "net_debt_to_ebitda", value: km.net_debt_to_ebitda, threshold: 3 },
      ],
      reason: "Capital structure deterioration.",
    });
  }

  return out;
}
