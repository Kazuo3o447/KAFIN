import { describe, expect, it } from "vitest";
import type { ProviderFact } from "@/lib/providers/types";
import { classifyBusinessModelProfile } from "@/lib/research/business-model-classifier";
import { buildQualitativeThesis, determineAnalysisDomain } from "@/lib/research/analysis-domain";
import { KeyMetricsSchema } from "@/lib/schemas/report";

function fact(field: string, value: unknown, title = field, url = `https://example.com/${field}`): ProviderFact {
  return {
    field,
    value,
    title,
    url,
    asOf: "2026-06-01",
    klass: "A",
  };
}

describe("analysis domain routing", () => {
  it("keeps healthy SaaS companies in the fundamental domain", () => {
    const profile = classifyBusinessModelProfile([
      fact("sector", "Technology"),
      fact("industry", "Application Software"),
      fact("company_description", "Cloud software platform with ARR and NRR above 110%"),
    ]);
    const decision = determineAnalysisDomain({
      profile,
      keyMetrics: KeyMetricsSchema.parse({
        revenue_growth_yoy: 0.22,
        revenue_cagr_3y: 0.19,
        gross_margin: 0.78,
        operating_margin: 0.18,
        fcf_margin: 0.16,
        roic: 0.21,
        capex_ocf_ratio: 0.08,
      }),
      facts: [],
      criticalCoverage: 0.9,
      runIncompleteDueToTechnicalFailure: false,
    });

    expect(profile.primaryFramework).toBe("saas_cloud");
    expect(decision.domain).toBe("fundamental");
  });

  it("routes AI infrastructure buildouts into the qualitative domain and extracts thesis evidence", () => {
    const facts = [
      fact(
        "filing_10k_item_1",
        "The company operates bitcoin mining sites and is repurposing them into AI and GPU data center infrastructure.",
        "10-K Item 1 Business",
        "https://www.sec.gov/Archives/iren-10k",
      ),
      fact(
        "news_contract",
        "IREN signs 5 GW AI infrastructure agreement with NVIDIA.",
        "NVIDIA 5 GW AI infrastructure agreement",
        "https://investors.iren.com/nvidia-5gw",
      ),
      fact(
        "news_financing",
        "Microsoft-backed financing package totals $3.65 billion for AI data center expansion.",
        "Microsoft financing package of $3.65 billion",
        "https://investors.iren.com/microsoft-365b",
      ),
      fact(
        "news_partner",
        "Dell will provide $1.6 billion of infrastructure and deployment support.",
        "Dell infrastructure support worth $1.6 billion",
        "https://investors.iren.com/dell-16b",
      ),
    ];

    const profile = classifyBusinessModelProfile(facts);
    const keyMetrics = KeyMetricsSchema.parse({
      fcf_margin: -3.05,
      roic: null,
      capex_ocf_ratio: 1.2,
      share_count_growth_yoy: 0.08,
      revenue_growth_yoy: 0,
    });
    const decision = determineAnalysisDomain({
      profile,
      keyMetrics,
      facts,
      criticalCoverage: 0.7,
      runIncompleteDueToTechnicalFailure: false,
    });
    const thesis = buildQualitativeThesis({
      facts,
      keyMetrics,
      profile,
      plausibilityFlags: [],
    });

    expect(profile.primaryFramework).toBe("ai_infrastructure_neocloud");
    expect(decision.domain).toBe("qualitative");
    expect(thesis.backlog.map((item) => item.claim).join(" ")).toContain("NVIDIA");
    expect(thesis.financing.map((item) => item.claim).join(" ")).toContain("Microsoft");
    expect(thesis.keyPartners.map((item) => item.claim).join(" ")).toContain("Dell");
  });

  it("routes technically incomplete runs into data_incomplete", () => {
    const profile = classifyBusinessModelProfile([
      fact("sector", "Technology"),
      fact("industry", "Application Software"),
      fact("company_description", "Cloud workflow software"),
    ]);
    const decision = determineAnalysisDomain({
      profile,
      keyMetrics: KeyMetricsSchema.parse({
        revenue_growth_yoy: null,
        revenue_cagr_3y: null,
        gross_margin: null,
        operating_margin: null,
        fcf_margin: null,
        roic: null,
      }),
      facts: [],
      criticalCoverage: 0.2,
      runIncompleteDueToTechnicalFailure: true,
    });

    expect(decision.domain).toBe("data_incomplete");
  });
});