/**
 * Kanonisches Step-Manifest — gemeinsame Quelle für Pipeline und UI.
 * Importiert von `pipeline.ts` (Step-Definitionen) und der Run-Seite (Stepper-Vorschau).
 *
 * Änderungen an Steps immer hier vornehmen; pipeline.ts referenziert diese Liste.
 */

export type StepPhase = "data" | "analysis" | "valuation";

export interface StepMeta {
  key: string;
  label: string;
  phase: StepPhase;
  /** Zielfortschritt in % nach Abschluss dieses Steps (aus pipeline.ts) */
  pct: number;
}

export const PHASE_LABELS: Record<StepPhase, string> = {
  data: "Daten sammeln",
  analysis: "Analyse",
  valuation: "Bewertung & Urteil",
};

export const STEP_MANIFEST: StepMeta[] = [
  // Phase 1: Daten
  { key: "fetch",       label: "Datenquellen abrufen",        phase: "data",      pct: 15 },
  { key: "normalize",   label: "Dataset normalisieren",        phase: "data",      pct: 18 },
  { key: "metrics",     label: "Kennzahlen berechnen",         phase: "data",      pct: 22 },
  { key: "context",     label: "Kontext aufbauen",             phase: "data",      pct: 30 },
  // Phase 2: Analyse
  { key: "extract",     label: "Fakten extrahieren",           phase: "analysis",  pct: 40 },
  { key: "sections",    label: "Achsen bewerten (Growth/Finance/Moat)", phase: "analysis", pct: 70 },
  { key: "score",       label: "Scoring & Gate",               phase: "analysis",  pct: 72 },
  { key: "timing",      label: "Timing-Achse & Regime",        phase: "analysis",  pct: 74 },
  { key: "peer",        label: "Peer-Percentile",              phase: "analysis",  pct: 76 },
  // Phase 3: Bewertung
  { key: "fair_value",  label: "Fair-Value-Brücke",            phase: "valuation", pct: 80 },
  { key: "trade_setup", label: "Trade-Setup",                  phase: "valuation", pct: 85 },
  { key: "analyst",     label: "KI-Critic & Red-Team",         phase: "valuation", pct: 92 },
  { key: "verdict",     label: "Verdikt-Generierung",          phase: "valuation", pct: 97 },
  { key: "persist",     label: "Persistieren",                 phase: "valuation", pct: 100 },
];

/** Sucht einen Step per key, undefined wenn nicht gefunden */
export function findStep(key: string): StepMeta | undefined {
  return STEP_MANIFEST.find((s) => s.key === key);
}
