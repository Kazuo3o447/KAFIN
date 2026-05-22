/**
 * Business-Model-Klassifikation anhand von SIC-Code (aus EDGAR) und
 * Fallback-Heuristik über Ticker/Name. 
 * Wird für das Peer-Bucketing (Phase B) und den LLM-Kontext verwendet.
 * Quellen: SEC SIC-Code-Tabelle; NAICS 2022.
 */
import type { ProviderFact } from "@/lib/providers/types";

export type BusinessModelType =
  | "SaaS"
  | "Infrastructure"
  | "Marketplace"
  | "FinTech"
  | "E-Commerce"
  | "BioTech"
  | "MedDevice"
  | "Semiconductor"
  | "EnterpriseHW"
  | "Industrial"
  | "Energy"
  | "Financial"
  | "Healthcare"
  | "Consumer"
  | "Media"
  | "Telecom"
  | "RealEstate"
  | "Other";

// SIC ranges → business model (ranges inclusive)
const SIC_RANGES: Array<[number, number, BusinessModelType]> = [
  // Agriculture, forestry, fishing
  [100, 999, "Industrial"],
  // Mining
  [1000, 1499, "Energy"],
  // Construction
  [1500, 1799, "Industrial"],
  // Manufacturing – food, tobacco, textile
  [2000, 2999, "Consumer"],
  // Manufacturing – chemicals, pharma
  [2800, 2836, "BioTech"],
  // Manufacturing – drugs
  [2830, 2836, "BioTech"],
  // Medical devices
  [3841, 3845, "MedDevice"],
  // Manufacturing – electronics, semiconductor
  [3559, 3579, "Semiconductor"],
  [3670, 3679, "Semiconductor"],
  [3672, 3672, "Semiconductor"], // Printed Circuit Boards
  [3674, 3674, "Semiconductor"], // Semiconductors
  // Manufacturing – computers
  [3570, 3579, "EnterpriseHW"],
  [3577, 3577, "EnterpriseHW"],
  // Manufacturing – other
  [3000, 3999, "Industrial"],
  // Transportation, utilities
  [4000, 4899, "Industrial"],
  // Telecom
  [4800, 4899, "Telecom"],
  [4810, 4899, "Telecom"],
  // Utilities
  [4900, 4999, "Energy"],
  // Wholesale
  [5000, 5199, "Industrial"],
  // Retail
  [5200, 5999, "Consumer"],
  // E-Commerce / Catalog retail
  [5940, 5999, "E-Commerce"],
  // Finance / Banks
  [6000, 6099, "Financial"],
  [6100, 6199, "FinTech"],
  [6200, 6299, "Financial"],
  [6300, 6399, "Financial"],
  // Insurance
  [6400, 6499, "Financial"],
  // Real Estate
  [6500, 6799, "RealEstate"],
  // Services – Hotels, Amusement
  [7000, 7099, "Consumer"],
  // Services – Computer programming, data processing → SaaS
  [7370, 7379, "SaaS"],
  [7372, 7372, "SaaS"],   // prepackaged software
  [7371, 7371, "SaaS"],   // computer programming
  [7374, 7374, "Infrastructure"],
  // Services – Healthcare
  [8000, 8099, "Healthcare"],
  [8011, 8049, "Healthcare"],
  // Services – Engineering
  [8700, 8799, "Industrial"],
  // Media
  [7810, 7819, "Media"],
  [7900, 7999, "Media"],
  [2700, 2799, "Media"],
  [4800, 4813, "Media"],
  // Other services
  [7000, 8999, "Other"],
];

const EXACT_SIC: Record<number, BusinessModelType> = {
  7372: "SaaS",
  7371: "SaaS",
  7374: "Infrastructure",
  7375: "SaaS",
  7379: "Infrastructure",
  3674: "Semiconductor",
  3672: "EnterpriseHW",
  3577: "EnterpriseHW",
  3841: "MedDevice",
  2836: "BioTech",
  2835: "BioTech",
  6159: "FinTech",
  6141: "FinTech",
};

// Keyword matching for name/description fallback
const NAME_KEYWORDS: Array<[RegExp, BusinessModelType]> = [
  [/\b(saas|cloud|software as a service|subscription software)\b/i, "SaaS"],
  [/\b(semiconductor|chip|fabless|fab|wafer|asic)\b/i, "Semiconductor"],
  [/\b(marketplace|platform|exchange|gig economy)\b/i, "Marketplace"],
  [/\b(fintech|payments|payment processing|neobank|digital bank)\b/i, "FinTech"],
  [/\b(e-?commerce|online retail|direct.?to.?consumer|dtc)\b/i, "E-Commerce"],
  [/\b(biotech|biopharma|gene therapy|mrna|biologics)\b/i, "BioTech"],
  [/\b(medical device|medtech|diagnostics|imaging system)\b/i, "MedDevice"],
  [/\b(infrastructure|cdn|data center|datacenter|hosting|cloud infra)\b/i, "Infrastructure"],
  [/\b(telecom|wireless carrier|mobile network|broadband)\b/i, "Telecom"],
  [/\b(real estate|reit|property trust)\b/i, "RealEstate"],
  [/\b(energy|oil|gas|petroleum|renewable|solar|wind power)\b/i, "Energy"],
  [/\b(bank|insurance|asset management|wealth management|brokerage)\b/i, "Financial"],
  [/\b(healthcare|hospital|clinic|pharmacy|payer)\b/i, "Healthcare"],
  [/\b(consumer|retail|brand|luxury|apparel|food|beverage)\b/i, "Consumer"],
  [/\b(media|streaming|content|entertainment|games|gaming)\b/i, "Media"],
];

function classifyBySic(sic: number): BusinessModelType | null {
  if (EXACT_SIC[sic]) return EXACT_SIC[sic];
  // Use exact ranges in order of specificity (longest match wins)
  // Sort by range size ascending so more specific ranges override
  const sorted = [...SIC_RANGES].sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
  for (const [low, high, type] of sorted) {
    if (sic >= low && sic <= high) return type;
  }
  return null;
}

function classifyByKeyword(text: string): BusinessModelType | null {
  for (const [re, type] of NAME_KEYWORDS) {
    if (re.test(text)) return type;
  }
  return null;
}

export interface BusinessModelResult {
  type: BusinessModelType;
  sic: number | null;
  confidence: "high" | "medium" | "low";
  source: "sic_exact" | "sic_range" | "keyword" | "fallback";
}

export function classifyBusinessModel(
  facts: ProviderFact[],
  ticker?: string,
): BusinessModelResult {
  // Try SIC from EDGAR / FMP facts
  let sic: number | null = null;
  for (const fact of facts) {
    if (fact.field === "sic" || fact.field === "edgar_sic") {
      const n = typeof fact.value === "number" ? fact.value
        : typeof fact.value === "string" ? Number(fact.value) : null;
      if (n !== null && Number.isFinite(n) && n > 0) { sic = n; break; }
    }
    // Sometimes SIC is buried in the profile payload
    if (typeof fact.value === "object" && fact.value !== null) {
      const rec = fact.value as Record<string, unknown>;
      if (typeof rec["sic"] === "number") { sic = rec["sic"]; break; }
      if (typeof rec["sic"] === "string") { const n = Number(rec["sic"]); if (!isNaN(n)) { sic = n; break; } }
    }
  }

  if (sic !== null) {
    const exactMatch = EXACT_SIC[sic];
    if (exactMatch) {
      return { type: exactMatch, sic, confidence: "high", source: "sic_exact" };
    }
    const rangeBased = classifyBySic(sic);
    if (rangeBased) {
      return { type: rangeBased, sic, confidence: "medium", source: "sic_range" };
    }
  }

  // Fallback: keyword match on company name / description from facts
  for (const fact of facts) {
    if (["company_name", "company_description", "longBusinessSummary", "description"].includes(fact.field)) {
      const text = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value);
      const kw = classifyByKeyword(text);
      if (kw) return { type: kw, sic, confidence: "medium", source: "keyword" };
    }
  }

  // Ticker-based keyword fallback
  if (ticker) {
    const kw = classifyByKeyword(ticker);
    if (kw) return { type: kw, sic, confidence: "low", source: "keyword" };
  }

  return { type: "Other", sic, confidence: "low", source: "fallback" };
}
