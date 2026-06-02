import type { ProviderFact } from "@/lib/providers/types";

export type BusinessModelType =
  | "SaaS"
  | "Cloud Software"
  | "AI Software"
  | "AI Infrastructure / Neocloud"
  | "Crypto Miner"
  | "Pre-Revenue Buildout"
  | "Clinical Biotech"
  | "SPAC"
  | "Hardware + SaaS"
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
    | "ai_infrastructure_neocloud"
    | "crypto_miner"
    | "pre_revenue_buildout"
    | "clinical_biotech"
    | "spac"
    | "hardware_plus_saas"
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
  const filingText = facts
    .filter((fact) => /filing|10-k|10k|10-q|10q|8-k|8k|annual report|item 1|mda/i.test(`${fact.field} ${fact.title ?? ""}`))
    .map((fact) => typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value ?? ""))
    .join(" ");
  const summary = [
    readFact(facts, "longBusinessSummary"),
    readFact(facts, "company_description"),
    readFact(facts, "description"),
    readFact(facts, "website"),
    filingText,
  ]
    .filter(Boolean)
    .join(" ");

  const text = `${sector} ${industry} ${summary}`.toLowerCase();

  if (/blank check|special purpose acquisition company|\bspac\b/.test(text)) {
    return {
      type: "SPAC",
      confidence: "high",
      primaryFramework: "spac",
      recurringRevenueLike: false,
      assetIntensity: "low",
      regulated: true,
      evidence: [
        { field: "summary", value: summary.slice(0, 180), source: filingText ? "filing" : "business_summary" },
      ],
    };
  }

  if (/(ai infrastructure|gpu cloud|gpu-as-a-service|neocloud|data center|datacenter|hpc|hyperscale)/.test(text)) {
    return {
      type: "AI Infrastructure / Neocloud",
      confidence: filingText ? "high" : "medium",
      primaryFramework: "ai_infrastructure_neocloud",
      recurringRevenueLike: false,
      assetIntensity: "high",
      regulated: false,
      evidence: [
        { field: "summary", value: summary.slice(0, 180), source: filingText ? "filing" : "business_summary" },
        { field: "sector", value: sector, source: "sector" },
      ],
    };
  }

  if (/(bitcoin|crypto).{0,24}(mining|miner)|miner.{0,24}(bitcoin|crypto)/.test(text)) {
    const aiPivot = /(ai infrastructure|gpu cloud|datacenter|data center|nvidia|microsoft|dell)/.test(text);
    return {
      type: aiPivot ? "AI Infrastructure / Neocloud" : "Crypto Miner",
      confidence: filingText ? "high" : "medium",
      primaryFramework: aiPivot ? "ai_infrastructure_neocloud" : "crypto_miner",
      recurringRevenueLike: false,
      assetIntensity: "high",
      regulated: false,
      evidence: [
        { field: "summary", value: summary.slice(0, 180), source: filingText ? "filing" : "business_summary" },
        { field: "industry", value: industry, source: "industry" },
      ],
    };
  }

  if (/(pre-revenue|development stage|commercialization has not commenced|buildout|build-out)/.test(text)) {
    return {
      type: "Pre-Revenue Buildout",
      confidence: filingText ? "high" : "medium",
      primaryFramework: "pre_revenue_buildout",
      recurringRevenueLike: false,
      assetIntensity: "high",
      regulated: false,
      evidence: [
        { field: "summary", value: summary.slice(0, 180), source: filingText ? "filing" : "business_summary" },
      ],
    };
  }

  if (/clinical stage|phase i|phase ii|phase iii|clinical trial|pipeline/.test(text)) {
    return {
      type: "Clinical Biotech",
      confidence: filingText ? "high" : "medium",
      primaryFramework: "clinical_biotech",
      recurringRevenueLike: false,
      assetIntensity: "high",
      regulated: true,
      evidence: [
        { field: "summary", value: summary.slice(0, 180), source: filingText ? "filing" : "business_summary" },
      ],
    };
  }

  if (/(taser|body camera|evidence\.com|sensors|devices and software|hardware and software)/.test(text)) {
    return {
      type: "Hardware + SaaS",
      confidence: filingText ? "high" : "medium",
      primaryFramework: "hardware_plus_saas",
      recurringRevenueLike: true,
      assetIntensity: "medium",
      regulated: false,
      evidence: [
        { field: "summary", value: summary.slice(0, 180), source: filingText ? "filing" : "business_summary" },
      ],
    };
  }

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
      ...(filingText
        ? [{ field: "filing", value: filingText.slice(0, 180), source: "filing" as const }]
        : []),
    ],
  };
}
