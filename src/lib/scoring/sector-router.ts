import type { CompanyDataset } from "@/lib/schemas/dataset";

export type RubricClass =
  | "industrial_software"
  | "financials"
  | "reit"
  | "insurance"
  | "biotech_pre_revenue"
  | "commodity_cyclical";

export interface SectorRouteResult {
  rubricClass: RubricClass;
  notScorableWithStandardRubric: boolean;
  notScorableReason: string | null;
}

function contains(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

export function classifyRubricClass(dataset: CompanyDataset): RubricClass {
  const sector = (dataset.identity.sector ?? "").toLowerCase();
  const industry = (dataset.identity.industry ?? "").toLowerCase();
  const id = `${sector} ${industry}`;

  if (contains(id, ["reit", "real estate investment trust"])) return "reit";
  if (contains(id, ["insurance", "insurer"])) return "insurance";
  if (contains(id, ["bank", "financial", "capital markets", "asset management"])) return "financials";
  if (contains(id, ["biotech", "biotechnology", "therapeutics"])) {
    const latestRevenue = dataset.annual.at(-1)?.revenue.value ?? null;
    if (latestRevenue === null || latestRevenue <= 0) return "biotech_pre_revenue";
    return "industrial_software";
  }
  if (contains(id, ["oil", "gas", "mining", "metals", "commodity", "steel", "coal", "materials"])) {
    return "commodity_cyclical";
  }
  return "industrial_software";
}

export function routeSector(dataset: CompanyDataset): SectorRouteResult {
  const rubricClass = classifyRubricClass(dataset);
  if (rubricClass === "industrial_software") {
    return {
      rubricClass,
      notScorableWithStandardRubric: false,
      notScorableReason: null,
    };
  }

  const reasons: Record<Exclude<RubricClass, "industrial_software">, string> = {
    financials:
      "Standard rubric is not appropriate for financials (requires sector metrics like NIM/CET1/combined ratio).",
    reit:
      "Standard rubric is not appropriate for REITs (requires FFO/AFFO based framework).",
    insurance:
      "Standard rubric is not appropriate for insurance (requires combined ratio/reserve metrics).",
    biotech_pre_revenue:
      "Standard rubric is not appropriate for pre-revenue biotech (pipeline/runway framework required).",
    commodity_cyclical:
      "Standard rubric is not appropriate for commodity cyclicals (cycle-adjusted framework required).",
  };

  return {
    rubricClass,
    notScorableWithStandardRubric: true,
    notScorableReason: reasons[rubricClass],
  };
}

export const SECTOR_RUBRIC_STUBS = {
  financials: ["nim", "cet1", "cost_income", "credit_losses"],
  reit: ["ffo", "affo", "occupancy", "net_debt_ebitda_reit"],
  insurance: ["combined_ratio", "reserve_adequacy", "solvency_ratio"],
  biotech_pre_revenue: ["cash_runway_months", "pipeline_stage_mix", "trial_catalysts"],
  commodity_cyclical: ["cycle_position", "cash_cost_curve", "balance_sheet_resilience"],
} as const;
