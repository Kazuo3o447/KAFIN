/**
 * P1: Safety-Gate — harte Veto-Logik unabhängig vom Score.
 * Separate vom Qualitäts-Gate (gate.ts), das score-basiert ist.
 *
 * Quellen: research.md §19, Beneish/Altman Schwellenwerte nach Literatur.
 */
import type { DerivedMetrics } from "@/lib/research/derived-metrics";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type SafetyStatus = "ok" | "warn" | "blocked";

export interface SafetyGateResult {
  status: SafetyStatus;
  reasons: string[];
}

/**
 * Prüft harte Veto-Bedingungen auf Basis abgeleiteter Metriken.
 * "blocked" → Gate = Red (unabhängig vom Score).
 * "warn"    → Gate = Yellow-Kandidat; weitere Prüfung nötig.
 * "ok"      → keine bekannte Warnung.
 *
 * @param m   Abgeleitete Metriken aus deriveMetricsFromDataset()
 * @param extraBlockers  Zusätzliche externe Blocker (z.B. aus hard_blockers des LLM-Outputs)
 */
export function evaluateSafetyGate(
  m: DerivedMetrics,
  extraBlockers: string[] = [],
): SafetyGateResult {
  const blocked: string[] = [];
  const warned: string[] = [];

  // --- Harte Blocker ---

  // 1. Cash Runway < Hard-Blocker-Schwelle
  if (m.cashRunwayMonths !== null && m.cashRunwayMonths < THRESHOLDS.cash_runway_hard_blocker_months) {
    blocked.push(`Cash Runway ${Math.round(m.cashRunwayMonths)}M < ${THRESHOLDS.cash_runway_hard_blocker_months}M (Going-Concern-Risiko)`);
  }

  // 2. Negatives Eigenkapital (stark überschuldet)
  if (m.equityRatio !== null && m.equityRatio < -0.20) {
    blocked.push(`Negatives EK-Verhältnis (${Math.round(m.equityRatio * 1000) / 10}%) — Überschuldungsrisiko`);
  }

  // 3. Externe Blocker (z.B. aus LLM-Analyse: Going-Concern, Fraud-Hinweise)
  for (const blocker of extraBlockers) {
    blocked.push(blocker);
  }

  // --- Warnungen ---

  // 4. Zinsdeckung unter 1,5× (EBIT kaum ausreichend für Schulddienst)
  if (m.interestCoverage !== null && m.interestCoverage > 0 && m.interestCoverage < 1.5) {
    warned.push(`Zinsdeckung ${Math.round(m.interestCoverage * 100) / 100}× < 1,5× (Schuldendienstrisiko)`);
  }

  // 5. Net Debt / EBITDA > 5× (sehr hohe Verschuldung)
  if (m.netDebtToEbitda !== null && m.netDebtToEbitda > 5) {
    warned.push(`Net Debt/EBITDA ${Math.round(m.netDebtToEbitda * 10) / 10}× > 5× (hohes Leverage)`);
  }

  // 6. Cash Runway unter Warning-Schwelle (aber noch über Hard-Blocker)
  if (
    m.cashRunwayMonths !== null &&
    m.cashRunwayMonths >= THRESHOLDS.cash_runway_hard_blocker_months &&
    m.cashRunwayMonths < THRESHOLDS.cash_runway_warning_months
  ) {
    warned.push(`Cash Runway ${Math.round(m.cashRunwayMonths)}M < ${THRESHOLDS.cash_runway_warning_months}M (Warnung)`);
  }

  const reasons = [...blocked, ...warned];
  const status: SafetyStatus =
    blocked.length > 0 ? "blocked" : warned.length > 0 ? "warn" : "ok";

  return { status, reasons };
}
