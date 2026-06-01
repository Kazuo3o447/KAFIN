import type { CompanyDataset } from "@/lib/schemas/dataset";

export interface EstimatesSignals {
  sue: number | null;
  beatStreak: number | null;
  revisionsBalance: number | null;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function computeEstimatesSignals(dataset: CompanyDataset): EstimatesSignals {
  const surprises = dataset.earningsHistory
    .slice(-8)
    .map((e) => e.surprisePct)
    .filter((v): v is number => typeof v === "number");

  const last = surprises.at(-1) ?? null;
  const sd = stddev(surprises);
  const mean = surprises.length > 0 ? surprises.reduce((s, v) => s + v, 0) / surprises.length : null;
  const sue = last !== null && mean !== null && sd !== null && sd > 0 ? (last - mean) / sd : null;

  let beatStreak: number | null = 0;
  for (const item of [...dataset.earningsHistory].reverse()) {
    if (typeof item.surprisePct !== "number") continue;
    if (item.surprisePct > 0) {
      beatStreak += 1;
      continue;
    }
    break;
  }
  if (beatStreak === 0 && surprises.length === 0) beatStreak = null;

  const revisionsBalance =
    dataset.analyst.upgrades3m !== null && dataset.analyst.downgrades3m !== null
      ? dataset.analyst.upgrades3m - dataset.analyst.downgrades3m
      : null;

  return { sue, beatStreak, revisionsBalance };
}
