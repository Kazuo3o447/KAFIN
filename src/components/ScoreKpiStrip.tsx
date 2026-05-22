/**
 * ScoreKpiStrip – Mini-Gauge + branchenadaptive KPI-Reihe mit Peer-Percentile-Pfeilen.
 * Phase F.4
 */
import type { KeyMetrics } from "@/lib/schemas/report";
import type { Gate } from "@/lib/scoring/gate";
import type { BusinessModelType } from "@/lib/research/business-model";
import { Gauge } from "@/components/Gauge";

interface KpiDef {
  key: keyof KeyMetrics;
  label: string;
  format: "pct" | "ratio" | "int";
  goodHigh: boolean;
}

const KPI_LAYOUTS: Record<string, KpiDef[]> = {
  SaaS: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",   format: "pct",   goodHigh: true },
    { key: "net_revenue_retention", label: "NRR",           format: "pct",   goodHigh: true },
    { key: "gross_margin",          label: "Gross Margin",  format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",    format: "pct",   goodHigh: true },
    { key: "rule_of_40",            label: "Rule of 40",    format: "int",   goodHigh: true },
    { key: "ev_sales",              label: "EV/Sales",      format: "ratio", goodHigh: false },
    { key: "sbc_to_revenue",        label: "SBC/Revenue",   format: "pct",   goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",   format: "int",   goodHigh: true },
  ],
  Infrastructure: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "gross_margin",          label: "Gross Margin",   format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",     format: "pct",   goodHigh: true },
    { key: "roic",                  label: "ROIC",           format: "pct",   goodHigh: true },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
    { key: "net_debt_to_ebitda",    label: "Net Debt/EBITDA",format: "ratio", goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
  ],
  Semiconductor: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "gross_margin",          label: "Gross Margin",   format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",     format: "pct",   goodHigh: true },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
    { key: "net_debt_to_ebitda",    label: "Net Debt/EBITDA",format: "ratio", goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
    { key: "altman_z",              label: "Altman Z",       format: "ratio", goodHigh: true },
  ],
  Marketplace: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "gross_margin",          label: "Gross Margin",   format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",     format: "pct",   goodHigh: true },
    { key: "rule_of_40",            label: "Rule of 40",     format: "int",   goodHigh: true },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
    { key: "sbc_to_revenue",        label: "SBC/Revenue",    format: "pct",   goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
  ],
  Financial: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "roic",                  label: "ROIC",           format: "pct",   goodHigh: true },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
    { key: "altman_z",              label: "Altman Z",       format: "ratio", goodHigh: true },
    { key: "beneish_m",             label: "Beneish M",      format: "ratio", goodHigh: false },
    { key: "ntm_pe",                label: "NTM P/E",        format: "ratio", goodHigh: false },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
  ],
  Healthcare: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "gross_margin",          label: "Gross Margin",   format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",     format: "pct",   goodHigh: true },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
    { key: "altman_z",              label: "Altman Z",       format: "ratio", goodHigh: true },
    { key: "beneish_m",             label: "Beneish M",      format: "ratio", goodHigh: false },
  ],
  Consumer: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "gross_margin",          label: "Gross Margin",   format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",     format: "pct",   goodHigh: true },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
    { key: "ntm_pe",                label: "NTM P/E",        format: "ratio", goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
    { key: "beneish_m",             label: "Beneish M",      format: "ratio", goodHigh: false },
  ],
  Industrial: [
    { key: "revenue_growth_yoy",    label: "Revenue YoY",    format: "pct",   goodHigh: true },
    { key: "operating_margin",      label: "Op. Margin",     format: "pct",   goodHigh: true },
    { key: "fcf_margin",            label: "FCF Margin",     format: "pct",   goodHigh: true },
    { key: "roic",                  label: "ROIC",           format: "pct",   goodHigh: true },
    { key: "net_debt_to_ebitda",    label: "Net Debt/EBITDA",format: "ratio", goodHigh: false },
    { key: "ev_sales",              label: "EV/Sales",       format: "ratio", goodHigh: false },
    { key: "piotroski_f",           label: "Piotroski F",    format: "int",   goodHigh: true },
    { key: "altman_z",              label: "Altman Z",       format: "ratio", goodHigh: true },
  ],
};

// Default for all other business models
const DEFAULT_KPI_LAYOUT: KpiDef[] = [
  { key: "revenue_growth_yoy",  label: "Revenue YoY",    format: "pct",   goodHigh: true },
  { key: "gross_margin",        label: "Gross Margin",   format: "pct",   goodHigh: true },
  { key: "fcf_margin",          label: "FCF Margin",     format: "pct",   goodHigh: true },
  { key: "roic",                label: "ROIC",           format: "pct",   goodHigh: true },
  { key: "ev_sales",            label: "EV/Sales",       format: "ratio", goodHigh: false },
  { key: "ntm_pe",              label: "NTM P/E",        format: "ratio", goodHigh: false },
  { key: "piotroski_f",         label: "Piotroski F",    format: "int",   goodHigh: true },
  { key: "altman_z",            label: "Altman Z",       format: "ratio", goodHigh: true },
];

function formatValue(v: number | null | undefined, format: KpiDef["format"]): string {
  if (v === null || v === undefined) return "—";
  if (format === "pct") return `${(v * 100).toFixed(1)} %`;
  if (format === "int") return String(Math.round(v));
  return v.toFixed(2);
}

function percentileArrow(
  percentile: number | undefined,
  goodHigh: boolean,
): { symbol: string; color: string; label: string } {
  if (percentile === undefined) return { symbol: "", color: "text-secondary-600", label: "" };
  const adjusted = goodHigh ? percentile : 100 - percentile;
  const label = `p${percentile}`;
  if (adjusted >= 60) return { symbol: "↑", color: "text-green-400", label };
  if (adjusted >= 40) return { symbol: "→", color: "text-secondary-400", label };
  return { symbol: "↓", color: "text-red-400", label };
}

interface Props {
  score: number;
  gate: Gate;
  keyMetrics: Partial<KeyMetrics>;
  peerPercentiles: Record<string, number>;
  businessModel: BusinessModelType | string;
}

export function ScoreKpiStrip({ score, gate, keyMetrics, peerPercentiles, businessModel }: Props) {
  const kpiLayout = KPI_LAYOUTS[businessModel] ?? DEFAULT_KPI_LAYOUT;

  return (
    <div className="glass-card p-4">
      <div className="flex items-start gap-5">
        {/* Mini gauge */}
        <div className="shrink-0">
          <Gauge score={score} gate={gate} size={80} />
          <div className="text-center text-xs text-secondary-500 mt-1">{score}/100</div>
        </div>

        {/* KPI tiles */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kpiLayout.map((kpi) => {
            const raw = keyMetrics[kpi.key];
            const v = typeof raw === "number" ? raw : null;
            const percentile = peerPercentiles[kpi.key];
            const arrow = percentileArrow(percentile, kpi.goodHigh);

            return (
              <div key={kpi.key} className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wider text-secondary-500">
                  {kpi.label}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[17px] font-medium text-secondary-100">
                    {formatValue(v, kpi.format)}
                  </span>
                  {arrow.symbol && (
                    <span className={`text-xs ${arrow.color}`} title={arrow.label}>
                      {arrow.symbol}
                      <span className="text-[9px] ml-0.5">{arrow.label}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { KPI_LAYOUTS, DEFAULT_KPI_LAYOUT };
