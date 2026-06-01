export type ImpliedGrowthClass =
  | "conservative"
  | "reasonable"
  | "ambitious"
  | "speculative"
  | "extreme";

function getThresholds(framework: string): { reasonable: number; ambitious: number; speculative: number; extreme: number } {
  if (framework === "saas_cloud") {
    return { reasonable: 0.12, ambitious: 0.2, speculative: 0.3, extreme: 0.45 };
  }
  if (framework === "dtc_healthcare") {
    return { reasonable: 0.1, ambitious: 0.18, speculative: 0.26, extreme: 0.4 };
  }
  return { reasonable: 0.08, ambitious: 0.15, speculative: 0.25, extreme: 0.35 };
}

export function classifyImpliedGrowth(
  impliedCagr: number,
  framework: string,
): ImpliedGrowthClass {
  const thresholds = getThresholds(framework);

  if (impliedCagr < thresholds.reasonable) return "conservative";
  if (impliedCagr < thresholds.ambitious) return "reasonable";
  if (impliedCagr < thresholds.speculative) return "ambitious";
  if (impliedCagr < thresholds.extreme) return "speculative";
  return "extreme";
}
