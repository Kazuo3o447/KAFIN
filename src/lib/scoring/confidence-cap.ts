import type { Confidence } from "./gate";
import type { BusinessModelProfile } from "@/lib/research/business-model-classifier";

export interface DataCoverage {
  keyMetricCoverage: number;
  criticalMetricCoverage: number;
  indicatorScoreCoverage: number;
  sourceSupportCoverage: number;
  providerCrossCheckCoverage: number;
  applicabilityAdjustedCoverage: number;
  missingCriticalMetrics: string[];
  notApplicableMetrics: string[];
  unsupportedClaims: string[];
  conflictingMetrics: string[];
}

export interface AuditFindings {
  unsupportedCriticalClaims: string[];
  conflictingCriticalMetrics: string[];
}

function rank(c: Confidence): number {
  if (c === "low") return 0;
  if (c === "medium") return 1;
  return 2;
}

function minConfidence(a: Confidence, b: Confidence): Confidence {
  return rank(a) <= rank(b) ? a : b;
}

export function applyConfidenceCaps(
  initial: Confidence,
  coverage: DataCoverage,
  audit: AuditFindings,
  profile: BusinessModelProfile,
): Confidence {
  let cap: Confidence = "high";

  if (coverage.criticalMetricCoverage < 0.55) cap = minConfidence(cap, "low");
  else if (coverage.criticalMetricCoverage < 0.75) cap = minConfidence(cap, "medium");

  if (coverage.sourceSupportCoverage < 0.70) cap = minConfidence(cap, "medium");
  if (coverage.sourceSupportCoverage < 0.50) cap = minConfidence(cap, "low");

  if (audit.unsupportedCriticalClaims.length > 0) cap = minConfidence(cap, "low");
  if (audit.conflictingCriticalMetrics.length > 0) cap = minConfidence(cap, "low");

  if (profile.confidence === "low") cap = minConfidence(cap, "medium");

  return minConfidence(initial, cap);
}
