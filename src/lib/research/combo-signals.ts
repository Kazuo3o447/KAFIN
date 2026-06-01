import type { KeyMetrics, Report } from "@/lib/schemas/report";

export interface ComboSignal {
  id: string;
  label: string;
  active: boolean;
  weight: number;
  description: string;
}

export function deriveComboSignals(report: {
  key_metrics: KeyMetrics;
  category: Report["category"];
  gate: Report["gate"];
  confidence: Report["confidence"];
  score_breakdown: Record<string, number>;
  fair_value?: Report["fair_value"] | null;
  timing_score?: number | null;
  regime?: Report["regime"] | null;
  business_model_type?: string;
}): ComboSignal[] {
  const km = report.key_metrics;

  return [
    {
      id: "growth_margin",
      label: "Growth + Margin",
      active:
        typeof km.revenue_growth_yoy === "number" && km.revenue_growth_yoy >= 0.18 &&
        typeof km.gross_margin === "number" && km.gross_margin >= 0.5 &&
        typeof km.fcf_margin === "number" && km.fcf_margin >= 0,
      weight: 1.0,
      description: "Umsatzwachstum trifft auf tragfähige Margen.",
    },
    {
      id: "quality_valuation",
      label: "Quality + Valuation",
      active:
        typeof km.roic === "number" && km.roic >= 0.12 &&
        typeof km.ev_sales === "number" && km.ev_sales <= 12,
      weight: 1.2,
      description: "Qualität wird nicht zu jedem Preis gekauft.",
    },
    {
      id: "cash_discipline",
      label: "Cash + Discipline",
      active:
        (typeof km.fcf_margin === "number" && km.fcf_margin > 0) &&
        (typeof km.share_count_growth_yoy !== "number" || km.share_count_growth_yoy <= 0.03) &&
        (typeof km.sbc_to_revenue !== "number" || km.sbc_to_revenue <= 0.1),
      weight: 1.1,
      description: "Freier Cashflow und kontrollierte Verwässerung.",
    },
    {
      id: "momentum_revisions",
      label: "Momentum + Revisions",
      active:
        typeof km.earnings_surprise_pct === "number" && km.earnings_surprise_pct > 0 &&
        typeof km.analyst_upgrades_3m === "number" &&
        typeof km.analyst_downgrades_3m === "number" &&
        km.analyst_upgrades_3m > km.analyst_downgrades_3m,
      weight: 0.9,
      description: "Positives Sentiment trifft auf operative Bestätigung.",
    },
    {
      id: "regime_support",
      label: "Regime Support",
      active: report.regime === "risk_on" && typeof report.timing_score === "number" && report.timing_score >= 45,
      weight: 0.8,
      description: "Der Marktwind unterstützt den Fundamental-Case.",
    },
  ];
}

export function deriveConfidenceScore(input: {
  coverage: number;
  confidence: Report["confidence"];
  hardBlockers: string[];
  sectorBaseline: { signals: string[] };
  comboSignals: ComboSignal[];
  scoreTrend: "up" | "down" | "flat" | null;
}): number {
  let score = Math.round(Math.max(0, Math.min(1, input.coverage)) * 100);

  if (input.hardBlockers.length > 0) score -= 22;
  if (input.confidence === "low") score -= 18;
  if (input.confidence === "medium") score -= 6;
  score += Math.min(12, input.sectorBaseline.signals.length * 3);
  score += Math.min(12, input.comboSignals.filter((signal) => signal.active).length * 4);
  if (input.scoreTrend === "up") score += 6;
  if (input.scoreTrend === "down") score -= 6;

  return Math.max(0, Math.min(100, score));
}
