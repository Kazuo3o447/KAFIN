/**
 * Schwellwerte aus research.md §38 (Konstanten-Register).
 * Jede Änderung hier muss in research.md §38 dokumentiert werden.
 * Keine Magic Numbers im Code-Body — alle Schwellen kommen von hier.
 */

export const THRESHOLDS = {
  // Kapital-Disziplin / Verwässerung (research.md §14.3)
  share_count_growth_red_flag: 0.03,
  share_count_growth_extreme: 0.10,
  sbc_to_revenue_red_flag: 0.10,
  sbc_to_ocf_red_flag: 0.30,
  net_debt_to_ebitda_red_flag: 3,

  // Cash Runway (research.md §14.3 / §19)
  cash_runway_warning_months: 18,
  cash_runway_hard_blocker_months: 12,

  // Rule of 40 (research.md §11.1)
  rule_of_40_floor: 40,

  // Coverage / Confidence (score.ts / signals.ts)
  coverage_floor: 0.5,
  coverage_too_hard: 0.35,

  // Forensik-Scores (research.md §38)
  piotroski_strong: 7,
  piotroski_weak: 3,
  altman_z_safe: 3.0,
  altman_z_distress: 1.8,
  beneish_m_manipulation: -1.78,
  mohanram_g_strong: 6,

  // Qualität / Margen-Stabilität (research.md §12.2)
  margin_stability_max_stddev: 0.05,   // 5 Prozentpunkte als Dezimal

  // ROIC–WACC (research.md §6.2)
  roic_wacc_spread_min: 0.0,

  // WACC-Defaults (Phase-1-Approximation, research.md §38)
  wacc_risk_free_rate: 0.045,          // US 10y proxy; überschreibbar via ENV WACC_RF
  wacc_equity_risk_premium: 0.055,     // überschreibbar via ENV WACC_ERP
  wacc_cost_of_debt: 0.05,
  wacc_tax_rate: 0.21,                 // US Default

  // Reverse-DCF Klassifikation (research.md §13.4)
  reverse_dcf_conservative: 0.08,
  reverse_dcf_fair: 0.15,
  reverse_dcf_ambitious: 0.25,

  // Source-Class-Gewichte (Phase E, research.md §7.1)
  source_class_weights: {
    "A": 1.0,
    "A-": 0.9,
    "B": 0.7,
    "B-": 0.5,
    "C": 0.4,
    "D": 0.2,
    "E": 0.1,
  } as Record<string, number>,

  // Provider-Konflikt-Severität (Phase E)
  conflict_medium_threshold: 0.05,     // >5% Abweichung → medium
  conflict_high_threshold: 0.15,       // >15% Abweichung → high

  // Stale-Data (Phase E, research.md §27.4-bis)
  stale_data_max_months: 18,
  stale_data_confidence_force_low: 3,  // >=3 stale Pflichtmetriken → confidence = "low"

  // Insider Activity (Phase D, research.md §16.5)
  insider_net_sell_alert_usd: -1_000_000,
  insider_growth_threshold: 0.20,

  // Semantic validation (Phase E)
  enable_semantic_validation: false,
} as const;
