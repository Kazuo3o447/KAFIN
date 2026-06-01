/**
 * Reverse-DCF: Berechnet die implizite Wachstumsrate des Marktpreises.
 * research.md §13.4.
 *
 * Fragestellung: Welches FCF-Wachstum ist nötig, damit der heutige Marktpreis fair ist?
 * Wenn die implizite Rate > conservative/fair/ambitious threshold, ist das Unternehmen
 * teuer eingepreist und das "Wachstum muss liefern".
 *
 * Modell: Gordon Growth / Exit-Multiple Hybrid (simplified).
 *   Enterprise Value = FCF_base * (1+g)^n / (wacc-g) + terminal  (wenn g < wacc)
 * Wir lösen numerisch nach g.
 */

import { classifyImpliedGrowth, type ImpliedGrowthClass } from "./reverse-dcf-classification";
import { DCF_ASSUMPTIONS } from "@/lib/research/assumptions";

export type PriceClassification =
  | ImpliedGrowthClass
  | "unknown";

export interface ReverseDCFResult {
  impliedGrowthRate: number | null;   // decimal, e.g. 0.15 = 15%
  classification: PriceClassification;
  inputs: {
    enterpriseValue: number | null;
    fcfBase: number | null;
    wacc: number | null;
    years: number;
  };
}

/**
 * Numerical root-finding (bisection) to solve for implied growth rate.
 * EV = FCF_0 * (1+g) / (wacc - g) * (1 - ((1+g)/(1+wacc))^n) + terminal
 * terminal = FCF_0 * (1+g)^n * (1+terminalGrowth) / (wacc - terminalGrowth) / (1+wacc)^n
 */
function computeDCFValue(
  fcfBase: number,
  wacc: number,
  growthRate: number,
  years: number,
  terminalGrowth: number,
): number | null {
  if (growthRate >= wacc) return null; // undefined
  if (Math.abs(wacc - terminalGrowth) < 0.001) return null;

  let pv = 0;
  for (let t = 1; t <= years; t++) {
    pv += (fcfBase * Math.pow(1 + growthRate, t)) / Math.pow(1 + wacc, t);
  }
  const terminalFCF = fcfBase * Math.pow(1 + growthRate, years) * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (wacc - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, years);
  return pv + pvTerminal;
}

export function computeReverseDCF(
  enterpriseValue: number | null,
  fcfBase: number | null,
  wacc: number | null,
  years: number = DCF_ASSUMPTIONS.horizonYears,
  terminalGrowth: number = DCF_ASSUMPTIONS.terminalGrowth,
  framework: string = "general_equity",
): ReverseDCFResult {
  const inputs = { enterpriseValue, fcfBase, wacc: wacc ?? null, years };

  if (
    enterpriseValue === null ||
    fcfBase === null ||
    wacc === null ||
    fcfBase <= 0 ||
    enterpriseValue <= 0 ||
    wacc <= 0
  ) {
    return { impliedGrowthRate: null, classification: "unknown", inputs };
  }

  // Bisection: find g in [terminalGrowth, wacc - 0.001] such that DCF(g) = EV
  let lo: number = terminalGrowth;
  let hi = wacc - 0.001;

  // Edge case: if even at minimum growth the DCF exceeds EV → cheap
  const dcfAtLo = computeDCFValue(fcfBase, wacc, lo, years, terminalGrowth);
  if (dcfAtLo !== null && dcfAtLo >= enterpriseValue) {
    return { impliedGrowthRate: lo, classification: "conservative", inputs };
  }
  // If at max growth DCF is still below EV → extremely speculative
  const dcfAtHi = computeDCFValue(fcfBase, wacc, hi, years, terminalGrowth);
  if (dcfAtHi === null || dcfAtHi < enterpriseValue) {
    return { impliedGrowthRate: hi, classification: "extreme", inputs };
  }

  // Bisection loop
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const dcfMid = computeDCFValue(fcfBase, wacc, mid, years, terminalGrowth);
    if (dcfMid === null) break;
    if (Math.abs(dcfMid - enterpriseValue) / enterpriseValue < 0.001) {
      lo = hi = mid;
      break;
    }
    if (dcfMid < enterpriseValue) lo = mid;
    else hi = mid;
  }

  const impliedGrowthRate = (lo + hi) / 2;

  const classification: PriceClassification = classifyImpliedGrowth(impliedGrowthRate, framework);

  return {
    impliedGrowthRate: Number(impliedGrowthRate.toFixed(4)),
    classification,
    inputs,
  };
}
