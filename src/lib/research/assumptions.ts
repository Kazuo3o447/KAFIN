export type ValueKind = "actual" | "estimate" | "derived" | "assumption";

export interface ModelAssumption {
  id: string;
  label: string;
  value: number;
  unit: "ratio" | "years";
  rationale: string;
  kind: "assumption";
}

export const ASSUMPTIONS_VERSION = "2026-06-01-korrektur-02";

export const WACC_DEFAULTS = {
  riskFreeRate: 0.045,
  equityRiskPremium: 0.055,
  costOfDebt: 0.05,
  taxRate: 0.21,
} as const;

export const DCF_ASSUMPTIONS = {
  terminalGrowth: 0.03,
  horizonYears: 10,
} as const;

export const FAIR_VALUE_ASSUMPTIONS = {
  singleMethodRangePct: 0.08,
} as const;

export const MODEL_ASSUMPTIONS: readonly ModelAssumption[] = [
  {
    id: "wacc_risk_free_rate",
    label: "WACC Risk-Free Rate",
    value: WACC_DEFAULTS.riskFreeRate,
    unit: "ratio",
    rationale: "US 10Y proxy for baseline discounting.",
    kind: "assumption",
  },
  {
    id: "wacc_equity_risk_premium",
    label: "WACC Equity Risk Premium",
    value: WACC_DEFAULTS.equityRiskPremium,
    unit: "ratio",
    rationale: "Long-run market ERP baseline.",
    kind: "assumption",
  },
  {
    id: "wacc_cost_of_debt",
    label: "WACC Cost of Debt",
    value: WACC_DEFAULTS.costOfDebt,
    unit: "ratio",
    rationale: "Default pre-tax debt cost if no issuer-specific spread is available.",
    kind: "assumption",
  },
  {
    id: "wacc_tax_rate",
    label: "WACC Tax Rate",
    value: WACC_DEFAULTS.taxRate,
    unit: "ratio",
    rationale: "Baseline corporate tax rate for after-tax cost of debt.",
    kind: "assumption",
  },
  {
    id: "dcf_terminal_growth",
    label: "DCF Terminal Growth",
    value: DCF_ASSUMPTIONS.terminalGrowth,
    unit: "ratio",
    rationale: "Conservative perpetual growth anchor.",
    kind: "assumption",
  },
  {
    id: "dcf_horizon_years",
    label: "DCF Horizon Years",
    value: DCF_ASSUMPTIONS.horizonYears,
    unit: "years",
    rationale: "Default explicit forecast horizon.",
    kind: "assumption",
  },
  {
    id: "fair_value_single_method_range_pct",
    label: "Fair Value Single-Method Band",
    value: FAIR_VALUE_ASSUMPTIONS.singleMethodRangePct,
    unit: "ratio",
    rationale: "Safety band when only one valuation method is applicable.",
    kind: "assumption",
  },
];
