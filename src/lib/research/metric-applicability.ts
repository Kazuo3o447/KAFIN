import type { KeyMetrics } from "@/lib/schemas/report";
import type { BusinessModelProfile } from "./business-model-classifier";

export type CoveragePolicy =
  | "included"
  | "excluded_not_applicable"
  | "included_missing_required_data";

export interface MetricApplicability {
  metric: string;
  applicable: boolean;
  framework:
    | "saas_cloud"
    | "it_services"
    | "dtc_subscription"
    | "dtc_healthcare"
    | "marketplace"
    | "ecommerce"
    | "financials"
    | "general_equity";
  reason: string;
  requiredInputs: string[];
  missingInputs: string[];
  coveragePolicy: CoveragePolicy;
  displayPolicy: "show" | "show_as_na" | "hide_from_main_report";
  replacementMetric?: string;
}

function requiredMissing(km: KeyMetrics, keys: Array<keyof KeyMetrics | string>): string[] {
  const missing: string[] = [];
  for (const key of keys) {
    if (key === "arr_growth_yoy or revenue_growth_yoy") {
      if (km.arr_growth_yoy == null && km.revenue_growth_yoy == null) {
        missing.push(String(key));
      }
      continue;
    }
    const typed = key as keyof KeyMetrics;
    if (km[typed] == null) missing.push(String(key));
  }
  return missing;
}

function ruleOf40Applicability(km: KeyMetrics, profile: BusinessModelProfile): MetricApplicability {
  const isSaasLike =
    profile.primaryFramework === "saas_cloud" ||
    profile.type === "SaaS" ||
    profile.type === "Cloud Software" ||
    profile.type === "AI Software";

  if (!isSaasLike) {
    return {
      metric: "rule_of_40",
      applicable: false,
      framework: "saas_cloud",
      reason: `Rule of 40 is SaaS/Cloud-specific; business model is ${profile.type}.`,
      requiredInputs: ["arr_growth_yoy or revenue_growth_yoy", "fcf_margin"],
      missingInputs: [],
      coveragePolicy: "excluded_not_applicable",
      displayPolicy: "show_as_na",
      replacementMetric: "business_model_efficiency",
    };
  }

  const missing = requiredMissing(km, ["arr_growth_yoy or revenue_growth_yoy", "fcf_margin"]);
  return {
    metric: "rule_of_40",
    applicable: missing.length === 0,
    framework: "saas_cloud",
    reason: missing.length > 0 ? `Missing required inputs: ${missing.join(", ")}.` : "Applicable SaaS/Cloud efficiency metric.",
    requiredInputs: ["arr_growth_yoy or revenue_growth_yoy", "fcf_margin"],
    missingInputs: missing,
    coveragePolicy: missing.length > 0 ? "included_missing_required_data" : "included",
    displayPolicy: "show",
  };
}

function simpleMetricApplicability(
  metric: string,
  framework: MetricApplicability["framework"],
  requiredInputs: Array<keyof KeyMetrics>,
  profile: BusinessModelProfile,
): MetricApplicability {
  const applicable =
    (metric === "rule_of_x" && profile.primaryFramework === "saas_cloud") ||
    (metric === "rule_of_20" && profile.primaryFramework === "it_services") ||
    (metric === "arr_growth_yoy" && profile.primaryFramework === "saas_cloud") ||
    metric === "business_model_efficiency";

  if (!applicable) {
    return {
      metric,
      applicable: false,
      framework,
      reason: `${metric} not primary for framework ${profile.primaryFramework}.`,
      requiredInputs: requiredInputs.map(String),
      missingInputs: [],
      coveragePolicy: "excluded_not_applicable",
      displayPolicy: "show_as_na",
      replacementMetric: metric === "rule_of_x" || metric === "rule_of_20" ? "business_model_efficiency" : undefined,
    };
  }

  return {
    metric,
    applicable: true,
    framework,
    reason: "Applicable metric.",
    requiredInputs: requiredInputs.map(String),
    missingInputs: [],
    coveragePolicy: "included",
    displayPolicy: "show",
  };
}

export function buildMetricApplicability(
  km: KeyMetrics,
  profile: BusinessModelProfile,
): Record<string, MetricApplicability> {
  return {
    rule_of_40: ruleOf40Applicability(km, profile),
    rule_of_x: simpleMetricApplicability("rule_of_x", "saas_cloud", ["rule_of_x"], profile),
    rule_of_20: simpleMetricApplicability("rule_of_20", "it_services", ["operating_margin"], profile),
    net_revenue_retention: simpleMetricApplicability("net_revenue_retention", "saas_cloud", ["net_revenue_retention"], profile),
    arr_growth_yoy: simpleMetricApplicability("arr_growth_yoy", "saas_cloud", ["arr_growth_yoy"], profile),
    business_model_efficiency: simpleMetricApplicability(
      "business_model_efficiency",
      profile.primaryFramework === "dtc_healthcare" ? "dtc_healthcare" : "general_equity",
      ["revenue_growth_yoy", "gross_margin", "fcf_margin", "sbc_to_revenue", "operating_margin"],
      profile,
    ),
  };
}
