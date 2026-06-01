import type { ProviderFact } from "@/lib/providers/types";

export type BusinessModelType =
  | "SaaS"
  | "Cloud Software"
  | "AI Software"
  | "IT Services"
  | "Marketplace"
  | "E-Commerce"
  | "DTC Subscription"
  | "DTC Healthcare Subscription"
  | "Telehealth Platform"
  | "Healthcare Services"
  | "Biotech"
  | "Pharma"
  | "MedTech"
  | "Bank"
  | "Insurance"
  | "Consumer Brand"
  | "Industrial"
  | "Semiconductor"
  | "Other";

export interface BusinessModelProfile {
  type: BusinessModelType;
  confidence: "low" | "medium" | "high";
  evidence: Array<{
    field: string;
    value: string;
    source: "sector" | "industry" | "business_summary" | "filing" | "llm" | "manual";
  }>;
  recurringRevenueLike: boolean | null;
  assetIntensity: "low" | "medium" | "high" | null;
  regulated: boolean | null;
  primaryFramework:
    | "saas_cloud"
    | "it_services"
    | "dtc_subscription"
    | "dtc_healthcare"
    | "marketplace"
    | "ecommerce"
    | "financials"
    | "healthcare_pipeline"
    | "general_equity";
}

function readFact(facts: ProviderFact[], fieldName: string): string {
  const hit = facts.find((f) => f.field.toLowerCase() === fieldName.toLowerCase());
  if (!hit) return "";
  if (typeof hit.value === "string") return hit.value;
  try {
    return JSON.stringify(hit.value);
  } catch {
    return String(hit.value ?? "");
  }
}

export function classifyBusinessModelProfile(facts: ProviderFact[]): BusinessModelProfile {
  const sector = readFact(facts, "sector");
  const industry = readFact(facts, "industry");
  const summary = [
    readFact(facts, "longBusinessSummary"),
    readFact(facts, "company_description"),
    readFact(facts, "description"),
    readFact(facts, "website"),
  ]
    .filter(Boolean)
    .join(" ");

  const text = `${sector} ${industry} ${summary}`.toLowerCase();

  if (
    sector.toLowerCase().includes("health") &&
    /telehealth|personalized care|subscription|online platform|digital health|consumer health/.test(text)
  ) {
    return {
      type: "DTC Healthcare Subscription",
      confidence: "medium",
      primaryFramework: "dtc_healthcare",
      recurringRevenueLike: null,
      assetIntensity: "medium",
      regulated: true,
      evidence: [
        { field: "sector", value: sector, source: "sector" },
        { field: "industry", value: industry, source: "industry" },
        { field: "summary", value: summary.slice(0, 180), source: "business_summary" },
      ],
    };
  }

  if (/saas|cloud software|software as a service|annual recurring revenue|arr|nrr/.test(text)) {
    return {
      type: "SaaS",
      confidence: "medium",
      primaryFramework: "saas_cloud",
      recurringRevenueLike: true,
      assetIntensity: "low",
      regulated: false,
      evidence: [{ field: "summary", value: summary.slice(0, 180), source: "business_summary" }],
    };
  }

  if (/it services|consulting|managed services|outsourcing/.test(text)) {
    return {
      type: "IT Services",
      confidence: "medium",
      primaryFramework: "it_services",
      recurringRevenueLike: false,
      assetIntensity: "medium",
      regulated: false,
      evidence: [{ field: "industry", value: industry, source: "industry" }],
    };
  }

  if (/marketplace|two-sided|buyer|seller|take rate/.test(text)) {
    return {
      type: "Marketplace",
      confidence: "medium",
      primaryFramework: "marketplace",
      recurringRevenueLike: false,
      assetIntensity: "medium",
      regulated: false,
      evidence: [{ field: "summary", value: summary.slice(0, 180), source: "business_summary" }],
    };
  }

  if (/bank|insurance|deposit|loan book|cet1|nim/.test(text)) {
    return {
      type: /insurance/.test(text) ? "Insurance" : "Bank",
      confidence: "medium",
      primaryFramework: "financials",
      recurringRevenueLike: null,
      assetIntensity: "high",
      regulated: true,
      evidence: [{ field: "industry", value: industry, source: "industry" }],
    };
  }

  return {
    type: "Other",
    confidence: "low",
    primaryFramework: "general_equity",
    recurringRevenueLike: null,
    assetIntensity: null,
    regulated: null,
    evidence: [
      { field: "sector", value: sector || "unknown", source: "sector" },
      { field: "industry", value: industry || "unknown", source: "industry" },
    ],
  };
}
