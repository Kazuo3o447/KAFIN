/**
 * Quality-GARP-Linse: Phase-1-Gatekeeper + Phase-2-Scoring
 *
 * Spec: .github/copilot-instructions/quality-garp.md
 *
 * Phase 1: Linsen-interne Quality-Gates (Durchfall → lens_fit: false + Reroute)
 * Phase 2: Glatte piecewise-lineare GARP-Blöcke
 */
import type { DerivedMetrics } from "@/lib/research/derived-metrics";
import { THRESHOLDS } from "@/lib/research/thresholds";

// ---------------------------------------------------------------------------
// Phase 1 — Quality-Gatekeeper
// ---------------------------------------------------------------------------

export interface GarpGatekeeperResult {
  /** true = alle Gates bestanden, GARP-Score sinnvoll */
  passed: boolean;
  /** Namen der durchgefallenen Gates (leer wenn passed) */
  failedGates: string[];
  /** Ziel-Linse bei Durchfall (immer emerging_winner) */
  rerouteTo: "emerging_winner" | null;
}

/**
 * Prüft die drei Quality-Gates der GARP-Linse.
 * @param m  DerivedMetrics
 * @param altmanZ  Altman-Z aus KeyMetrics (wird extern übergeben, da nicht in DerivedMetrics)
 */
export function checkQualityGarpGatekeepers(
  m: DerivedMetrics,
  altmanZ: number | null,
): GarpGatekeeperResult {
  const failed: string[] = [];

  // Gate 1: FCF TTM > 0 (positive Cashflow, kein Liquiditätsrisiko)
  if (m.fcfMargin === null || m.fcfMargin <= 0) {
    failed.push("fcf_ttm_positive");
  }

  // Gate 2: ROIC > WACC (Wertschöpfung, kein Kapitalvernichter)
  if (m.roic === null || m.wacc === null || m.roic <= m.wacc) {
    failed.push("roic_above_wacc");
  }

  // Gate 3: Altman Z > 2.99 (Bilanzstabilität)
  if (altmanZ === null || altmanZ <= THRESHOLDS.garp_quality_altman_min) {
    failed.push("altman_z_healthy");
  }

  return {
    passed: failed.length === 0,
    failedGates: failed,
    rerouteTo: failed.length > 0 ? "emerging_winner" : null,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — GARP-Score (0–100)
// ---------------------------------------------------------------------------

/** Lineare Interpolation: x ∈ [x0, x1] → [y0, y1], geclippt */
function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Berechnet den GARP-Gesamt-Block-Score (0–100).
 *
 * Gewichte (müssen 1.0 ergeben):
 *   - Reverse-DCF-Asymmetrie: 40%
 *   - FCF-PEG:                30%
 *   - Margin-Momentum:        15%
 *   - Capex/OCF:              15%
 */
export function computeQualityGarpScore(m: DerivedMetrics): number {
  // -------------------------------------------------------------------------
  // Block 1: Reverse-DCF-Asymmetrie (40%)
  // Vollpunkte ab +8pp Delta; 0 wenn impliziert > Prognose (negativ oder null)
  // -------------------------------------------------------------------------
  let asymScore = 0;
  if (m.reverseDcfAsymmetry !== null) {
    // Symmetrische Kennlinie: 0 (asymm=0) → 100 (asymm≥+8pp)
    // Negativ = Überpreis → 0 (geclippt durch lerp)
    asymScore = lerp(m.reverseDcfAsymmetry, 0, 0, THRESHOLDS.garp_asymmetry_full_pts, 100);
  }

  // -------------------------------------------------------------------------
  // Block 2: FCF-PEG (30%)
  // Vollpunkte bei ≤1,0; linear 0 bei ≥2,0
  // -------------------------------------------------------------------------
  let fcfPegScore = 0;
  if (m.fcfPeg !== null && m.fcfPeg > 0) {
    fcfPegScore = lerp(
      m.fcfPeg,
      THRESHOLDS.garp_fcf_peg_full,
      100,
      THRESHOLDS.garp_fcf_peg_zero,
      0,
    );
  }

  // -------------------------------------------------------------------------
  // Block 3: Margin-Momentum (15%)
  // Slope: pos. Trend GM + FCF → höherer Score (Basis 50; ±25 je Slope)
  // Slopes kommen in Dezimal pro Jahr (z.B. 0.01 = +1pp/Jahr)
  // Vollpunkte: beide Slopes > +2pp/Jahr; 50 bei Seitwärts; 0 bei < −2pp/Jahr
  // -------------------------------------------------------------------------
  const SLOPE_SCALE = 0.02; // ±2pp/Jahr = Vollausschlag
  const gmSlope = m.grossMarginTrend ?? 0;
  const fcfSlope = m.fcfMarginTrend ?? 0;
  const avgSlope = (gmSlope + fcfSlope) / 2;
  const marginMomentumScore = lerp(avgSlope, -SLOPE_SCALE, 0, SLOPE_SCALE, 100);

  // -------------------------------------------------------------------------
  // Block 4: Capex/OCF (15%)
  // Niedrig = asset-light = voller Score; hoch = kapitalintensiv = 0
  // -------------------------------------------------------------------------
  let capexScore = 50; // Default: kein Datenpunkt → Mitte
  if (m.capexOcfRatio !== null) {
    capexScore = lerp(
      m.capexOcfRatio,
      THRESHOLDS.garp_capex_ocf_full,
      100,
      THRESHOLDS.garp_capex_ocf_zero,
      0,
    );
  }

  // -------------------------------------------------------------------------
  // Gewichteter Gesamt-Score
  // -------------------------------------------------------------------------
  const totalScore =
    asymScore * 0.4 +
    fcfPegScore * 0.3 +
    marginMomentumScore * 0.15 +
    capexScore * 0.15;

  return Math.round(Math.max(0, Math.min(100, totalScore)));
}
