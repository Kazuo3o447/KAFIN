import { describe, expect, it } from "vitest";
import { KeyMetricsSchema } from "@/lib/schemas/report";
import { buildMetricApplicability } from "@/lib/research/metric-applicability";
import type { BusinessModelProfile } from "@/lib/research/business-model-classifier";

describe("metric applicability - rule of 40", () => {
  it("marks rule_of_40 not applicable for dtc healthcare profile", () => {
    const km = KeyMetricsSchema.parse({});
    const profile: BusinessModelProfile = {
      type: "DTC Healthcare Subscription",
      confidence: "medium",
      evidence: [],
      recurringRevenueLike: null,
      assetIntensity: "medium",
      regulated: true,
      primaryFramework: "dtc_healthcare",
    };

    const app = buildMetricApplicability(km, profile);
    expect(app.rule_of_40.applicable).toBe(false);
    expect(app.rule_of_40.coveragePolicy).toBe("excluded_not_applicable");
    expect(app.rule_of_40.reason).toContain("SaaS/Cloud-specific");
  });
});
