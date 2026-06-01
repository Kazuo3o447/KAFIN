import type { KeyMetrics } from "@/lib/schemas/report";
import type { BusinessModelProfile } from "@/lib/research/business-model-classifier";

export type IndicatorDataStatus =
  | "valid"
  | "missing_required_data"
  | "not_applicable"
  | "unsupported_claim"
  | "conflicting_data"
  | "stale_data";

export interface DeterministicScoreResult {
  score: number | null;
  method: string;
  metricRefs: string[];
  missingMetricRefs: string[];
  dataStatus: IndicatorDataStatus;
}

function score(scoreValue: number, method: string, metricRefs: string[]): DeterministicScoreResult {
  return { score: Math.max(0, Math.min(10, scoreValue)), method, metricRefs, missingMetricRefs: [], dataStatus: "valid" };
}

function missing(...refs: string[]): DeterministicScoreResult {
  return { score: null, method: "missing_required_data", metricRefs: [], missingMetricRefs: refs, dataStatus: "missing_required_data" };
}

export function deterministicIndicatorScore(
  indicatorKey: string,
  km: KeyMetrics,
  profile: BusinessModelProfile,
): DeterministicScoreResult | null {
  if (indicatorKey === "gross_margin_quality") {
    if (km.gross_margin == null) return missing("gross_margin");
    const gm = km.gross_margin;
    if (profile.primaryFramework === "dtc_healthcare") {
      if (gm >= 0.75) return score(9, "gross_margin >= 75% for DTC healthcare", ["gross_margin"]);
      if (gm >= 0.65) return score(8, "gross_margin 65-75% for DTC healthcare", ["gross_margin"]);
      if (gm >= 0.5) return score(6, "gross_margin 50-65% for DTC healthcare", ["gross_margin"]);
      return score(3, "gross_margin < 50% for DTC healthcare", ["gross_margin"]);
    }
    if (gm >= 0.8) return score(10, "gross_margin >= 80%", ["gross_margin"]);
    if (gm >= 0.65) return score(8, "gross_margin 65-80%", ["gross_margin"]);
    if (gm >= 0.5) return score(6, "gross_margin 50-65%", ["gross_margin"]);
    if (gm >= 0.3) return score(4, "gross_margin 30-50%", ["gross_margin"]);
    return score(2, "gross_margin < 30%", ["gross_margin"]);
  }

  if (indicatorKey === "operating_leverage") {
    if (km.operating_margin == null) return missing("operating_margin");
    const om = km.operating_margin;
    const trend = km.operating_margin_trend;
    if (om >= 0.25) return score(10, "operating_margin >= 25%", ["operating_margin"]);
    if (om >= 0.15) return score(8, "operating_margin 15-25%", ["operating_margin"]);
    if (om >= 0.05) return score(6, "operating_margin 5-15%", ["operating_margin"]);
    if (om >= 0) return score(4, "operating_margin 0-5%", ["operating_margin"]);
    if (om >= -0.05) return score(3, "operating_margin -5% to 0%", ["operating_margin"]);
    if (trend != null && trend > 0) return score(2, "operating_margin < -5% but improving", ["operating_margin", "operating_margin_trend"]);
    return score(1, "operating_margin < -5%", ["operating_margin"]);
  }

  if (indicatorKey === "sbc_burden") {
    if (km.sbc_to_revenue == null) return missing("sbc_to_revenue");
    const s = km.sbc_to_revenue;
    if (s <= 0.02) return score(10, "sbc_to_revenue <= 2%", ["sbc_to_revenue"]);
    if (s <= 0.05) return score(8, "sbc_to_revenue 2-5%", ["sbc_to_revenue"]);
    if (s <= 0.1) return score(5, "sbc_to_revenue 5-10%", ["sbc_to_revenue"]);
    return score(2, "sbc_to_revenue > 10%", ["sbc_to_revenue"]);
  }

  if (indicatorKey === "share_count_dilution") {
    if (km.share_count_growth_yoy == null) return missing("share_count_growth_yoy");
    const d = km.share_count_growth_yoy;
    if (d <= -0.02) return score(10, "share count shrinking >2%", ["share_count_growth_yoy"]);
    if (d <= 0.01) return score(8, "share count stable", ["share_count_growth_yoy"]);
    if (d <= 0.03) return score(5, "share count dilution 1-3%", ["share_count_growth_yoy"]);
    if (d <= 0.07) return score(3, "share count dilution 3-7%", ["share_count_growth_yoy"]);
    return score(1, "share count dilution >7%", ["share_count_growth_yoy"]);
  }

  if (indicatorKey === "business_model_efficiency" || indicatorKey === "rule_of_40_x_20") {
    const refs: Array<keyof KeyMetrics> = [
      "revenue_growth_yoy",
      "gross_margin",
      "fcf_margin",
      "sbc_to_revenue",
      "operating_margin",
    ];
    const missingRefs = refs.filter((k) => km[k] == null).map(String);

    if (profile.primaryFramework === "saas_cloud") {
      if (km.rule_of_40 == null) return missing("rule_of_40");
      const v = km.rule_of_40;
      if (v >= 50) return score(9, "Rule of 40 >= 50", ["rule_of_40"]);
      if (v >= 40) return score(7, "Rule of 40 40-50", ["rule_of_40"]);
      return score(3, "Rule of 40 < 40", ["rule_of_40"]);
    }

    if (profile.primaryFramework === "dtc_healthcare") {
      if (missingRefs.length >= 3) return missing(...missingRefs);
      let scoreValue = 5;
      if (typeof km.revenue_growth_yoy === "number" && km.revenue_growth_yoy >= 0.2) scoreValue += 1.5;
      if (typeof km.revenue_growth_yoy === "number" && km.revenue_growth_yoy < 0.05) scoreValue -= 1.5;
      if (typeof km.gross_margin === "number" && km.gross_margin >= 0.65) scoreValue += 1;
      if (typeof km.fcf_margin === "number" && km.fcf_margin > 0) scoreValue += 1;
      if (typeof km.sbc_to_revenue === "number" && km.sbc_to_revenue <= 0.05) scoreValue += 0.5;
      if (typeof km.operating_margin === "number" && km.operating_margin < 0) scoreValue -= 1;
      return score(scoreValue, "DTC healthcare efficiency composite", refs.filter((k) => km[k] != null).map(String));
    }

    if (missingRefs.length > 0) return missing(...missingRefs);
    return score(5, "General efficiency baseline", refs.map(String));
  }

  return null;
}
