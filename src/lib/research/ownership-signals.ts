import type { CompanyDataset } from "@/lib/schemas/dataset";
import { THRESHOLDS } from "@/lib/research/thresholds";

export interface OwnershipSignals {
  clusterBuy: boolean;
  buySellRatio: number | null;
  netInsiderUsdWeighted: number | null;
  institutionalTrend: "accumulating" | "distributing" | "flat" | null;
  squeezeSetup: boolean;
  shortRisk: boolean;
  buybackYield: number | null;
  netDilution: number | null;
  ownershipScore: number | null;
}

function roleWeight(role: string): number {
  if (role === "CEO" || role === "CFO") return THRESHOLDS.insider_c_level_weight;
  if (role === "officer") return THRESHOLDS.insider_officer_weight;
  if (role === "director") return THRESHOLDS.insider_director_weight;
  return 1;
}

export function computeOwnershipSignals(dataset: CompanyDataset): OwnershipSignals {
  const openMarket = dataset.insiderTransactions.filter((t) => t.isOpenMarket);
  const buys = openMarket.filter((t) => t.type === "buy");
  const sells = openMarket.filter((t) => t.type === "sell");

  const now = new Date(dataset.identity.asOf);
  const windowBuys = buys.filter((b) => {
    const dt = new Date(b.date);
    const diffDays = (now.getTime() - dt.getTime()) / 86_400_000;
    return diffDays <= THRESHOLDS.insider_cluster_window_days;
  });
  const hasCLevel = windowBuys.some((b) => b.role === "CEO" || b.role === "CFO");
  const clusterBuy = windowBuys.length >= THRESHOLDS.insider_cluster_min_buy_count && hasCLevel;

  const weightedBuy = buys.reduce(
    (s, b) => s + (typeof b.valueUsd === "number" ? b.valueUsd * roleWeight(b.role) : 0),
    0,
  );
  const weightedSell = sells.reduce(
    (s, b) => s + (typeof b.valueUsd === "number" ? b.valueUsd * roleWeight(b.role) : 0),
    0,
  );
  const buySellRatio = weightedSell > 0 ? weightedBuy / weightedSell : weightedBuy > 0 ? 99 : null;
  const netInsiderUsdWeighted = weightedBuy - weightedSell;

  const shortPct = dataset.shortInterest.pctOfFloat;
  const revisionsBalance =
    dataset.analyst.upgrades3m !== null && dataset.analyst.downgrades3m !== null
      ? dataset.analyst.upgrades3m - dataset.analyst.downgrades3m
      : null;

  const squeezeSetup =
    typeof shortPct === "number" &&
    shortPct >= THRESHOLDS.short_interest_high_pct_float &&
    typeof revisionsBalance === "number" &&
    revisionsBalance >= THRESHOLDS.squeeze_revision_min &&
    clusterBuy;

  const shortRisk =
    typeof shortPct === "number" &&
    shortPct >= THRESHOLDS.short_interest_high_pct_float &&
    !squeezeSetup;

  const latestAnnual = dataset.annual[dataset.annual.length - 1];
  const buyback = latestAnnual?.shareRepurchases.value ?? null;
  const price = dataset.prices.daily.at(-1)?.close ?? null;
  const shares = dataset.ownership.sharesOutstanding;
  const marketCap = typeof price === "number" && typeof shares === "number" ? price * shares : null;
  const buybackYield = marketCap !== null && marketCap > 0 && typeof buyback === "number" ? Math.abs(buyback) / marketCap : null;

  const prevAnnual = dataset.annual.length > 1 ? dataset.annual[dataset.annual.length - 2] : null;
  const sharesCurrent = latestAnnual?.sharesDiluted.value;
  const sharesPrev = prevAnnual?.sharesDiluted.value;
  const netDilution =
    typeof sharesCurrent === "number" &&
    typeof sharesPrev === "number" &&
    sharesPrev > 0
      ? (sharesCurrent / sharesPrev) - 1
      : null;

  let ownershipScore = 5;
  if (clusterBuy) ownershipScore += 2;
  if ((dataset.ownership.institutionalTrend ?? null) === "accumulating") ownershipScore += 1;
  if (shortRisk) ownershipScore -= 2;
  if (squeezeSetup) ownershipScore += 1;
  if (typeof netDilution === "number" && netDilution > THRESHOLDS.share_count_growth_red_flag) ownershipScore -= 1;
  if (typeof buybackYield === "number" && buybackYield > 0.02) ownershipScore += 1;
  ownershipScore = Math.max(0, Math.min(10, ownershipScore));

  return {
    clusterBuy,
    buySellRatio,
    netInsiderUsdWeighted,
    institutionalTrend: dataset.ownership.institutionalTrend,
    squeezeSetup,
    shortRisk,
    buybackYield,
    netDilution,
    ownershipScore,
  };
}
