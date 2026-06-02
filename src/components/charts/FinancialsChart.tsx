/**
 * FinancialsChart – echte Jahres-Zeitreihe (Revenue, EBIT, FCF)
 * Client-Komponente, empfängt serialisierte chart_data.financials_annual als Props.
 */
"use client";

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

interface AnnualPoint {
  year: string;
  revenue: number | null;
  ebit: number | null;
  fcf: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  fcfMargin: number | null;
}

interface Props {
  data: AnnualPoint[];
}

function fmtBn(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number | null; color: string }>; label?: string }) => {
  if (!active || !payload) return null;
  return (
    <div className="border border-secondary-700 bg-secondary-950 p-2 text-[11px]">
      <div className="text-secondary-300 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value !== null && typeof p.value === "number" && Math.abs(p.value) < 2 ? fmtPct(p.value) : fmtBn(p.value)}
        </div>
      ))}
    </div>
  );
};

export function FinancialsChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-secondary-500 h-full flex items-center justify-center">keine Daten</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="abs" hide />
        <YAxis yAxisId="pct" orientation="right" hide />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
        <Bar yAxisId="abs" dataKey="revenue" name="Revenue" fill="#334155" radius={[1, 1, 0, 0]} />
        <Line yAxisId="abs" type="monotone" dataKey="ebit" name="EBIT" stroke="#6ee7b7" dot={false} strokeWidth={1.5} />
        <Line yAxisId="abs" type="monotone" dataKey="fcf" name="FCF" stroke="#7dd3fc" dot={false} strokeWidth={1.5} strokeDasharray="3 2" />
        <Line yAxisId="pct" type="monotone" dataKey="fcfMargin" name="FCF%" stroke="#fbbf24" dot={false} strokeWidth={1} strokeDasharray="2 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
