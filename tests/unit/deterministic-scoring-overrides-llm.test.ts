import { describe, expect, it } from "vitest";
import { deterministicIndicatorScore } from "@/lib/scoring/deterministic";
import { KeyMetricsSchema } from "@/lib/schemas/report";

describe("deterministic scoring", () => {
  it("produces deterministic gross_margin_quality score", () => {
    const km = KeyMetricsSchema.parse({ gross_margin: 0.72 });
    const res = deterministicIndicatorScore("gross_margin_quality", km, {
      type: "DTC Healthcare Subscription",
      confidence: "medium",
      evidence: [],
      recurringRevenueLike: null,
      assetIntensity: "medium",
      regulated: true,
      primaryFramework: "dtc_healthcare",
    });

    expect(res?.score).toBe(8);
    expect(res?.dataStatus).toBe("valid");
  });

  it("marks share_count_dilution missing when share count growth is null", () => {
    const km = KeyMetricsSchema.parse({ share_count_growth_yoy: null });
    const res = deterministicIndicatorScore("share_count_dilution", km, {
      type: "Other",
      confidence: "low",
      evidence: [],
      recurringRevenueLike: null,
      assetIntensity: null,
      regulated: null,
      primaryFramework: "general_equity",
    });

    expect(res?.score).toBeNull();
    expect(res?.dataStatus).toBe("missing_required_data");
  });
});
