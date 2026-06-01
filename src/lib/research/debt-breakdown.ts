import type { ProviderFact } from "@/lib/providers/types";
import { THRESHOLDS } from "@/lib/research/thresholds";

export interface DebtBreakdown {
  cash_and_equivalents: number | null;
  short_term_investments: number | null;
  total_cash_and_investments: number | null;

  convertible_notes_principal: number | null;
  term_debt: number | null;
  finance_lease_liabilities: number | null;
  operating_lease_liabilities: number | null;
  other_provider_total_debt_components: number | null;

  provider_total_debt: number | null;
  interest_bearing_debt: number | null;

  net_debt_provider_raw: number | null;
  net_debt_interest_bearing: number | null;
  net_cash_after_interest_bearing_debt: number | null;

  confidence: "low" | "medium" | "high";
  issues: string[];
}

function latestNumFact(facts: ProviderFact[], field: string): number | null {
  const match = facts
    .filter((f) => f.field === field)
    .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
  if (!match) return null;
  const v = match.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function buildDebtBreakdown(facts: ProviderFact[]): DebtBreakdown {
  const cash = latestNumFact(facts, "cash_and_equivalents") ?? latestNumFact(facts, "cash") ?? latestNumFact(facts, "total_cash");
  const sti = latestNumFact(facts, "short_term_investments");
  const totalCashInvestments = (cash ?? 0) + (sti ?? 0);

  const providerTotalDebt = latestNumFact(facts, "total_debt") ?? latestNumFact(facts, "long_term_debt");
  const shortTermDebt = latestNumFact(facts, "short_term_debt") ?? latestNumFact(facts, "current_portion_of_long_term_debt");
  const longTermDebt = latestNumFact(facts, "long_term_debt");
  const explicitTermDebt = latestNumFact(facts, "term_debt");
  const termDebt =
    explicitTermDebt ??
    ([shortTermDebt, longTermDebt].filter((x): x is number => x != null).reduce((s, x) => s + x, 0) || null);
  const convertible = latestNumFact(facts, "convertible_notes_principal") ?? latestNumFact(facts, "convertible_debt");
  const financeLease = latestNumFact(facts, "finance_lease_liabilities");
  const operatingLease = latestNumFact(facts, "operating_lease_liabilities");

  const disclosedDebtInclOperatingLease = [termDebt, convertible, financeLease, operatingLease]
    .filter((x): x is number => x != null)
    .reduce((s, x) => s + x, 0);

  const hasComponents = termDebt != null || convertible != null || financeLease != null;

  const otherProviderComponents =
    providerTotalDebt != null && hasComponents
      ? Math.max(providerTotalDebt - disclosedDebtInclOperatingLease, 0)
      : null;

  // Core leverage should exclude operating lease liabilities.
  const interestBearing = [termDebt, convertible, financeLease, otherProviderComponents]
    .filter((x): x is number => x != null)
    .reduce((s, x) => s + x, 0);

  const netDebtProviderRaw = providerTotalDebt != null ? providerTotalDebt - totalCashInvestments : null;
  const netDebtInterestBearing = hasComponents || otherProviderComponents != null ? interestBearing - totalCashInvestments : null;
  const netCashAfterInterestBearingDebt = netDebtInterestBearing != null ? -netDebtInterestBearing : null;

  const issues: string[] = [];
  let confidence: "low" | "medium" | "high" = "high";

  if (
    providerTotalDebt != null &&
    disclosedDebtInclOperatingLease > 0 &&
    disclosedDebtInclOperatingLease > providerTotalDebt * 1.2
  ) {
    issues.push("debt component sum exceeds provider total debt (plausibility warning)");
    confidence = "low";
  }

  if (providerTotalDebt != null && disclosedDebtInclOperatingLease > 0) {
    const ratio = Math.max(providerTotalDebt, disclosedDebtInclOperatingLease) / Math.max(Math.min(providerTotalDebt, disclosedDebtInclOperatingLease), 1);
    if (ratio >= THRESHOLDS.scale_sanity_ratio_threshold) {
      issues.push("scale mismatch suspicion: debt components differ by approximately x1000");
      confidence = "low";
    }
  }
  if (cash != null && cash < 0) {
    issues.push("cash_and_equivalents is negative (plausibility warning)");
    confidence = "low";
  }
  if (operatingLease != null && operatingLease < 0) {
    issues.push("operating lease liabilities are negative (plausibility warning)");
    confidence = "low";
  }

  if (!hasComponents && providerTotalDebt != null) {
    confidence = "low";
    issues.push("provider total debt requires lease/debt component reconciliation");
  } else if (hasComponents) {
    if (operatingLease == null) {
      if (confidence !== "low") confidence = "medium";
      issues.push("operating lease liabilities missing");
    }
    if (providerTotalDebt != null) {
      const delta = Math.abs(providerTotalDebt - disclosedDebtInclOperatingLease);
      const tolerance = Math.max(providerTotalDebt * 0.15, 50);
      if (delta > tolerance) {
        if (confidence === "high") confidence = "medium";
        issues.push("debt decomposition differs materially from provider total debt");
      }
    }
  }

  return {
    cash_and_equivalents: cash,
    short_term_investments: sti,
    total_cash_and_investments: cash == null && sti == null ? null : totalCashInvestments,
    convertible_notes_principal: convertible,
    term_debt: termDebt,
    finance_lease_liabilities: financeLease,
    operating_lease_liabilities: operatingLease,
    other_provider_total_debt_components: otherProviderComponents,
    provider_total_debt: providerTotalDebt,
    interest_bearing_debt: hasComponents || otherProviderComponents != null ? interestBearing : null,
    net_debt_provider_raw: netDebtProviderRaw,
    net_debt_interest_bearing: netDebtInterestBearing,
    net_cash_after_interest_bearing_debt: netCashAfterInterestBearingDebt,
    confidence,
    issues,
  };
}
