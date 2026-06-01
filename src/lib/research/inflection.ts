import type { CompanyDataset } from "@/lib/schemas/dataset";
import { THRESHOLDS } from "@/lib/research/thresholds";

export interface InflectionFlags {
  grossMarginTurnedPositive: boolean;
  operatingMarginTurnedPositive: boolean;
  fcfTurnedPositive: boolean;
  lossNarrowingTowardBreakeven: boolean;
  revenueAccelerationPositive: boolean;
  revisionMomentumPositive: boolean;
}

function marginSeries(
  dataset: CompanyDataset,
  field: "grossProfit" | "ebit" | "freeCashflow",
): number[] {
  return dataset.quarterly
    .map((q) => {
      const rev = q.revenue.value;
      const v = q[field].value;
      return typeof rev === "number" && rev > 0 && typeof v === "number" ? v / rev : null;
    })
    .filter((v): v is number => v !== null);
}

function turnedPositive(series: number[]): boolean {
  if (series.length < 2) return false;
  const prev = series[series.length - 2]!;
  const cur = series[series.length - 1]!;
  return prev <= 0 && cur > 0;
}

function monotonicTowardZero(values: number[]): boolean {
  if (values.length < THRESHOLDS.inflection_monotonic_quarters) return false;
  const tail = values.slice(-THRESHOLDS.inflection_monotonic_quarters);
  for (let i = 1; i < tail.length; i += 1) {
    const prev = tail[i - 1]!;
    const cur = tail[i]!;
    if (Math.abs(cur) > Math.abs(prev)) return false;
  }
  return true;
}

export function computeInflectionFlags(dataset: CompanyDataset, revisionsBalance: number | null, sue: number | null): InflectionFlags {
  const gm = marginSeries(dataset, "grossProfit");
  const om = marginSeries(dataset, "ebit");
  const fcf = marginSeries(dataset, "freeCashflow");

  const revenue = dataset.quarterly.map((q) => q.revenue.value);
  const yoy: number[] = [];
  for (let i = 4; i < revenue.length; i += 1) {
    const cur = revenue[i];
    const prev = revenue[i - 4];
    if (typeof cur === "number" && typeof prev === "number" && prev > 0) yoy.push(cur / prev - 1);
  }
  const acceleration = yoy.length >= 2 ? yoy[yoy.length - 1]! - yoy[yoy.length - 2]! : null;

  const netIncomeSeries = dataset.quarterly
    .map((q) => q.netIncome.value)
    .filter((v): v is number => typeof v === "number");

  const lossNarrowingTowardBreakeven =
    netIncomeSeries.length >= THRESHOLDS.inflection_monotonic_quarters &&
    netIncomeSeries.slice(-THRESHOLDS.inflection_monotonic_quarters).every((v) => v <= 0) &&
    monotonicTowardZero(netIncomeSeries) &&
    fcf.length > 0 &&
    fcf[fcf.length - 1]! > 0;

  return {
    grossMarginTurnedPositive: turnedPositive(gm),
    operatingMarginTurnedPositive: turnedPositive(om),
    fcfTurnedPositive: turnedPositive(fcf),
    lossNarrowingTowardBreakeven,
    revenueAccelerationPositive:
      typeof acceleration === "number" && acceleration > THRESHOLDS.inflection_acceleration_min,
    revisionMomentumPositive:
      typeof revisionsBalance === "number" &&
      typeof sue === "number" &&
      revisionsBalance > THRESHOLDS.revisions_positive &&
      sue > THRESHOLDS.catalysts_sue_positive,
  };
}
