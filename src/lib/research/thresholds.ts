/**
 * Schwellwerte aus research.md §38 (Konstanten-Register).
 * Jede Änderung hier muss in research.md §38 dokumentiert werden.
 * Keine Magic Numbers im Code-Body — alle Schwellen kommen von hier.
 */

import { DCF_ASSUMPTIONS, WACC_DEFAULTS } from "@/lib/research/assumptions";

export const THRESHOLDS = {
  version: "2026-06-01-korrektur-02",
  changelog: [
    "2026-06-01: Added provider conflict tolerance, fetch retry/backoff defaults, ownership block lens weights, and scale sanity checks.",
  ] as const,

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
  wacc_risk_free_rate: WACC_DEFAULTS.riskFreeRate,
  wacc_equity_risk_premium: WACC_DEFAULTS.equityRiskPremium,
  wacc_cost_of_debt: WACC_DEFAULTS.costOfDebt,
  wacc_tax_rate: WACC_DEFAULTS.taxRate,

  // Reverse-DCF Klassifikation (research.md §13.4)
  reverse_dcf_conservative: 0.08,
  reverse_dcf_fair: 0.15,
  reverse_dcf_ambitious: 0.25,
  reverse_dcf_terminal_growth: DCF_ASSUMPTIONS.terminalGrowth,

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
  provider_conflict_tolerance: 0.02,   // <=2% delta is tolerated
  conflict_medium_threshold: 0.05,     // >5% Abweichung → medium
  conflict_high_threshold: 0.15,       // >15% Abweichung → high

  // Fetch robustness (KORREKTUR-02)
  provider_fetch_max_retries: 2,
  provider_fetch_backoff_ms: 250,
  provider_fetch_backoff_factor: 2,

  // Scale sanity checks
  scale_sanity_ratio_threshold: 800,

  // Trade setup (Phase 6C)
  margin_of_safety_quality_risk_on: 0.15,
  margin_of_safety_quality_neutral: 0.18,
  margin_of_safety_quality_risk_off: 0.22,
  margin_of_safety_emerging_risk_on: 0.18,
  margin_of_safety_emerging_neutral: 0.22,
  margin_of_safety_emerging_risk_off: 0.25,
  trade_stop_atr_multiple: 1.8,
  trade_zone_buffer_pct: 0.01,

  // Stale-Data (Phase E, research.md §27.4-bis)
  stale_data_max_months: 18,
  stale_data_confidence_force_low: 3,  // >=3 stale Pflichtmetriken → confidence = "low"

  // Insider Activity (Phase D, research.md §16.5)
  insider_net_sell_alert_usd: -1_000_000,
  insider_growth_threshold: 0.20,

  // Semantic validation (Phase E)
  enable_semantic_validation: false,

  // ---------------------------------------------------------------------
  // Phase 2: Rubric thresholds (deterministic indicator functions)
  // ---------------------------------------------------------------------
  growth_revenue_yoy_strong: 0.20,
  growth_revenue_yoy_excellent: 0.35,
  growth_revenue_cagr3y_strong: 0.15,
  growth_revenue_cagr3y_excellent: 0.25,
  growth_acceleration_positive: 0.01,
  retention_strong: 1.05,

  gross_margin_strong: 0.50,
  operating_margin_strong: 0.15,
  fcf_margin_strong: 0.12,
  rule_of_x_floor: 50,

  roic_strong: 0.15,
  roce_strong: 0.12,
  roe_strong: 0.15,

  valuation_history_z_cheap: -0.5,
  valuation_history_z_expensive: 0.5,
  valuation_upside_positive: 0.1,
  valuation_upside_negative: -0.1,

  catalysts_sue_positive: 0.25,
  revisions_positive: 1,
  beat_streak_strong: 3,

  risk_interest_coverage_safe: 4,
  risk_equity_ratio_safe: 0.35,
  stale_share_max_ratio: 0.35,

  // ---------------------------------------------------------------------
  // Phase 2: Valuation regime and fair-value stability
  // ---------------------------------------------------------------------
  valuation_preprofit_ebit_floor: 0,
  valuation_preprofit_eps_floor: 0,
  valuation_margin_trend_positive: 0,
  valuation_cyclical_margin_stddev: 0.12,
  valuation_mature_margin_stddev: 0.06,
  valuation_stable_positive_years: 3,
  fair_value_min_stability: 0.45,

  // ---------------------------------------------------------------------
  // Phase 2: Inflection signals
  // ---------------------------------------------------------------------
  inflection_slope_min: 0.005,
  inflection_monotonic_quarters: 4,
  inflection_acceleration_min: 0.01,

  // ---------------------------------------------------------------------
  // Phase 2: Ownership & smart money
  // ---------------------------------------------------------------------
  insider_cluster_window_days: 45,
  insider_cluster_min_buy_count: 2,
  insider_c_level_weight: 1.5,
  insider_officer_weight: 1.2,
  insider_director_weight: 1.0,
  short_interest_high_pct_float: 0.12,
  squeeze_revision_min: 1,

  // ---------------------------------------------------------------------
  // Phase 2: Lens weights and gates
  // ---------------------------------------------------------------------
  lens_quality_weight_growth_market: 14,
  lens_quality_weight_unit_economics_margins: 16,
  lens_quality_weight_quality_moat: 20,
  lens_quality_weight_valuation: 12,
  lens_quality_weight_capital_discipline_dilution: 14,
  lens_quality_weight_catalysts_revisions_sentiment: 8,
  lens_quality_weight_ownership_smart_money: 8,
  lens_quality_weight_risk_fragility: 8,

  lens_emerging_weight_growth_market: 20,
  lens_emerging_weight_unit_economics_margins: 16,
  lens_emerging_weight_quality_moat: 10,
  lens_emerging_weight_valuation: 10,
  lens_emerging_weight_capital_discipline_dilution: 10,
  lens_emerging_weight_catalysts_revisions_sentiment: 16,
  lens_emerging_weight_ownership_smart_money: 8,
  lens_emerging_weight_risk_fragility: 10,

  lens_quality_min_score_green: 70,
  lens_emerging_min_score_green: 68,

  aaqs_revenue_cagr10y_min: 0.05,
  aaqs_revenue_cagr3y_fwd_min: 0.05,
  aaqs_ebit_cagr10y_min: 0.05,
  aaqs_ebit_cagr3y_fwd_min: 0.05,
  aaqs_roce_min: 0.10,
  aaqs_net_debt_to_ebitda_max: 3,
  aaqs_earnings_yield_min: 0.04,
  aaqs_fcf_margin_min: 0.05,
  aaqs_margin_stability_max_stddev: 0.08,
  aaqs_dilution_max: 0.03,

  // ---------------------------------------------------------------------
  // Phase 3: Technicals
  // ---------------------------------------------------------------------
  technical_sma_fast_days: 50,
  technical_sma_slow_days: 200,
  technical_ema_fast_days: 50,
  technical_ema_slow_days: 200,
  technical_lookback_52w_days: 252,
  technical_rsi_days: 14,
  technical_macd_fast_days: 12,
  technical_macd_slow_days: 26,
  technical_macd_signal_days: 9,
  technical_rel_strength_1m_days: 21,
  technical_rel_strength_3m_days: 63,
  technical_rel_strength_6m_days: 126,
  technical_rel_strength_12m_days: 252,
  technical_atr_days: 14,
  technical_realized_vol_days: 21,
  beta_window_days: 252,

  // Timing score bands
  timing_high_threshold: 60,
  timing_mid_threshold: 45,
  timing_regime_risk_off_penalty: 8,

  // ---------------------------------------------------------------------
  // Phase 3: Market regime
  // ---------------------------------------------------------------------
  regime_vix_percentile_risk_on_max: 0.35,
  regime_vix_percentile_risk_off_min: 0.7,
  regime_index_vs_ma200_risk_on_min: 0.02,
  regime_index_vs_ma200_risk_off_max: -0.03,
  regime_hy_spread_risk_on_max: 0.045,
  regime_hy_spread_risk_off_min: 0.06,
  regime_hy_spread_trend_risk_off_min: 0.005,
  regime_yield_curve_risk_off_max: -0.005,
  regime_breadth_risk_on_min: 0.6,
  regime_breadth_risk_off_max: 0.4,

  // ---------------------------------------------------------------------
  // Phase 3: Quadrant action table thresholds
  // ---------------------------------------------------------------------
  quadrant_fundamental_high_min: 70,
  quadrant_timing_high_min: 60,

  // ---------------------------------------------------------------------
  // Phase 3: Sector router classes
  // ---------------------------------------------------------------------
  sector_router_classes: [
    "industrial_software",
    "financials",
    "reit",
    "insurance",
    "biotech_pre_revenue",
    "commodity_cyclical",
  ] as const,

  // ---------------------------------------------------------------------
  // Phase 3: Reporting normalization defaults
  // ---------------------------------------------------------------------
  reporting_currency_default: "USD",
  fx_default_fallback_rate: 1,
  analyst_number_tolerance: 0.005,

  // Quadrant x Regime deterministic action table
  timing_action_table: {
    risk_on: {
      kaufen: "active_accumulate",
      warten: "watchlist_pullback",
      spekulativ: "small_speculative_probe",
      meiden: "avoid",
    },
    neutral: {
      kaufen: "accumulate_selective",
      warten: "watchlist_wait",
      spekulativ: "speculative_only_small",
      meiden: "avoid",
    },
    risk_off: {
      kaufen: "accumulate_small_tranches",
      warten: "watchlist_wait_or_smaller_size",
      spekulativ: "avoid_high_beta_speculation",
      meiden: "strict_avoid",
    },
  } as const,
} as const;
