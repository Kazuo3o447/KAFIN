import type { KeyMetrics } from "@/lib/schemas/report";

export interface SectorBaselineUsed {
  id: string;
  label: string;
  sector: string;
  reference: {
    revenueGrowthMin: number;
    grossMarginMin: number;
    fcfMarginMin: number;
    roicMin: number;
    valuationCeiling: number;
  };
  signals: string[];
}

interface BaselineProfile {
  id: string;
  label: string;
  sectorHints: string[];
  revenueGrowthMin: number;
  grossMarginMin: number;
  fcfMarginMin: number;
  roicMin: number;
  valuationCeiling: number;
}

const DEFAULT_BASELINE: BaselineProfile = {
  id: "generic",
  label: "Generic Growth Baseline",
  sectorHints: ["other"],
  revenueGrowthMin: 0.12,
  grossMarginMin: 0.40,
  fcfMarginMin: 0.06,
  roicMin: 0.10,
  valuationCeiling: 10,
};

const BASELINES: BaselineProfile[] = [
  {
    id: "software",
    label: "Software / SaaS",
    sectorHints: ["software", "saas", "internet", "platform", "marketplace"],
    revenueGrowthMin: 0.18,
    grossMarginMin: 0.65,
    fcfMarginMin: 0.12,
    roicMin: 0.12,
    valuationCeiling: 18,
  },
  {
    id: "semiconductor",
    label: "Semiconductor / Hardware",
    sectorHints: ["semiconductor", "hardware", "electronics"],
    revenueGrowthMin: 0.12,
    grossMarginMin: 0.40,
    fcfMarginMin: 0.08,
    roicMin: 0.11,
    valuationCeiling: 14,
  },
  {
    id: "healthcare",
    label: "Healthcare / Biotech",
    sectorHints: ["healthcare", "biotech", "pharma", "medtech"],
    revenueGrowthMin: 0.14,
    grossMarginMin: 0.55,
    fcfMarginMin: 0.05,
    roicMin: 0.10,
    valuationCeiling: 16,
  },
  {
    id: "financials",
    label: "Financials",
    sectorHints: ["financial", "bank", "insurance"],
    revenueGrowthMin: 0.08,
    grossMarginMin: 0.30,
    fcfMarginMin: 0.04,
    roicMin: 0.12,
    valuationCeiling: 12,
  },
  {
    id: "consumer",
    label: "Consumer / Marketplace",
    sectorHints: ["consumer", "retail", "ecommerce", "marketplace", "platform"],
    revenueGrowthMin: 0.15,
    grossMarginMin: 0.45,
    fcfMarginMin: 0.06,
    roicMin: 0.10,
    valuationCeiling: 14,
  },
  {
    id: "industrial",
    label: "Industrial / Cyclical",
    sectorHints: ["industrial", "manufacturing", "materials", "energy", "utilities"],
    revenueGrowthMin: 0.10,
    grossMarginMin: 0.25,
    fcfMarginMin: 0.05,
    roicMin: 0.09,
    valuationCeiling: 11,
  },
];

function normalize(input: string | undefined | null): string {
  return (input ?? "").trim().toLowerCase();
}

function pickBaseline(sector?: string | null, businessModelType?: string | null): BaselineProfile {
  const haystack = `${normalize(sector)} ${normalize(businessModelType)}`;
  for (const profile of BASELINES) {
    if (profile.sectorHints.some((hint) => haystack.includes(hint))) return profile;
  }
  return DEFAULT_BASELINE;
}

function addSignal(signals: string[], condition: boolean, label: string): void {
  if (condition) signals.push(label);
}

export function summarizeSectorBaseline(
  sector?: string | null,
  businessModelType?: string | null,
  metrics?: Partial<KeyMetrics> | null,
): SectorBaselineUsed {
  const profile = pickBaseline(sector, businessModelType);
  const signals: string[] = [];

  addSignal(signals, typeof metrics?.revenue_growth_yoy === "number" && metrics.revenue_growth_yoy >= profile.revenueGrowthMin, "Wachstum oberhalb Sektor-Baseline");
  addSignal(signals, typeof metrics?.gross_margin === "number" && metrics.gross_margin >= profile.grossMarginMin, "Bruttomarge oberhalb Baseline");
  addSignal(signals, typeof metrics?.fcf_margin === "number" && metrics.fcf_margin >= profile.fcfMarginMin, "FCF-Marge oberhalb Baseline");
  addSignal(signals, typeof metrics?.roic === "number" && metrics.roic >= profile.roicMin, "ROIC oberhalb Baseline");
  addSignal(signals, typeof metrics?.ev_sales === "number" && metrics.ev_sales <= profile.valuationCeiling, "Bewertung innerhalb Sektorband");

  return {
    id: profile.id,
    label: profile.label,
    sector: sector?.trim() || businessModelType?.trim() || "Other",
    reference: {
      revenueGrowthMin: profile.revenueGrowthMin,
      grossMarginMin: profile.grossMarginMin,
      fcfMarginMin: profile.fcfMarginMin,
      roicMin: profile.roicMin,
      valuationCeiling: profile.valuationCeiling,
    },
    signals,
  };
}
