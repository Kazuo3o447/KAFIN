/**
 * P1: Drei-Achsen-Modell (Growth · Finance · Moat).
 * Aggregiert die 8 Block-Ergebnisse des deterministischen Scorings auf 3 fundamental-
 * ökonomische Achsen (je 0–100). KI-Subscore wird in P2 befüllt (in P1 immer null).
 */
import type { BlockResult } from "./score";
import type { BlockKey } from "./weights";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type AxisKey = "growth" | "finance" | "moat";

export interface AxisSubScore {
  /** 0–100, null wenn kein Input verfügbar */
  value: number | null;
  /** 0–1 gewichtetes Coverage aus den Blöcken */
  coverage: number;
  /** Indikator-Keys, die beigetragen haben */
  inputs: string[];
  source: "quant" | "ki";
}

export interface AxisResult {
  axis: AxisKey;
  /** Quantitativer Subscore (deterministisch) */
  quant: AxisSubScore;
  /** KI-Subscore: in P1 immer null; in P2 befüllt */
  ki: AxisSubScore | null;
  /** Gewichteter Blend aus quant + ki (0–100) */
  combined: number | null;
  /** |quant.value - ki.value|, null wenn ki fehlt */
  divergence: number | null;
  /** Effektives KI-Gewicht im Blend (0 in P1) */
  kiWeightEffective: number;
  /** Menschlich-lesbares Kurz-Label (z.B. "Strong Growth") */
  rating: string | null;
}

/**
 * Anteile der Blöcke an den drei Achsen (Summe je Achse muss > 0 sein).
 * Ein Block kann zu mehreren Achsen beitragen (mit reduziertem Anteil).
 */
const AXIS_BLOCK_SHARES: Record<AxisKey, Partial<Record<BlockKey, number>>> = {
  growth: {
    growth_market: 1.0,
    catalysts_revisions_sentiment: 0.60, // Revisionen = Wachstumsbestätigung
  },
  finance: {
    unit_economics_margins: 1.0,
    capital_discipline_dilution: 1.0,
    risk_fragility: 0.50,               // 50% finanzieller Fragilitätsanteil
  },
  moat: {
    quality_moat: 1.0,
  },
};

function axisLabel(axis: AxisKey, value: number | null): string | null {
  if (value === null) return null;
  if (axis === "growth") {
    if (value >= 75) return "Starkes Wachstum";
    if (value >= 55) return "Solides Wachstum";
    if (value >= 35) return "Moderates Wachstum";
    return "Schwaches Wachstum";
  }
  if (axis === "finance") {
    if (value >= 75) return "Exzellente Finanzstruktur";
    if (value >= 55) return "Solide Finanzen";
    if (value >= 35) return "Schwankende Finanzen";
    return "Fragile Finanzen";
  }
  if (axis === "moat") {
    if (value >= 70) return "Wide Moat";
    if (value >= 50) return "Narrow Moat";
    if (value >= 30) return "Emerging Moat";
    return "No Moat";
  }
  return null;
}

/**
 * Berechnet die drei Achsen aus den deterministischen Block-Ergebnissen.
 * @param blocks  BlockResult-Map aus computeScore()
 * @returns       AxisResult[] (immer alle drei Achsen)
 */
export function computeAxes(blocks: Record<BlockKey, BlockResult>): AxisResult[] {
  const results: AxisResult[] = [];

  for (const axis of ["growth", "finance", "moat"] as AxisKey[]) {
    const shares = AXIS_BLOCK_SHARES[axis];
    let weightedSum = 0;
    let totalShare = 0;
    let weightedCoverage = 0;
    const inputKeys: string[] = [];

    for (const [blockKeyStr, share] of Object.entries(shares) as Array<[BlockKey, number]>) {
      const block = blocks[blockKeyStr];
      if (!block) continue;

      // Block-Score 0–10 → normiert auf 0–100
      const blockScore100 = block.effectiveScore * 10;
      weightedSum += blockScore100 * share;
      totalShare += share;
      weightedCoverage += block.coverage * share;
      for (const ind of block.indicators) {
        if (ind.value !== null) inputKeys.push(ind.key);
      }
    }

    const rawValue = totalShare > 0 ? weightedSum / totalShare : null;

    // Moat-Achse: rein quantitativer Quant-Score wird auf moat_quant_returns_cap gedeckelt.
    const value =
      rawValue !== null && axis === "moat"
        ? Math.min(rawValue, THRESHOLDS.moat_quant_returns_cap)
        : rawValue;

    const coverage = totalShare > 0 ? weightedCoverage / totalShare : 0;

    const quant: AxisSubScore = {
      value: value !== null ? Math.round(value * 10) / 10 : null,
      coverage,
      inputs: [...new Set(inputKeys)],
      source: "quant",
    };

    // P1: kein KI-Layer → kiWeightEffective = 0, combined = quant.value
    results.push({
      axis,
      quant,
      ki: null,
      combined: quant.value,
      divergence: null,
      kiWeightEffective: 0,
      rating: axisLabel(axis, quant.value),
    });
  }

  return results;
}

/**
 * Gibt zurück, ob mindestens eine Achse menschliche Review benötigt
 * (divergence >= axis_divergence_review). In P1 immer false (kein KI-Layer).
 */
export function needsAxisReview(axes: AxisResult[]): boolean {
  return axes.some(
    (a) => a.divergence !== null && Math.abs(a.divergence) >= THRESHOLDS.axis_divergence_review,
  );
}
