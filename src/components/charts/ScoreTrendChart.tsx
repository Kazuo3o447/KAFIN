/**
 * ScoreTrendChart – Score-Trend als Area-Chart aus der Score-History.
 * Client-Komponente.
 */
"use client";
import React from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

interface HistoryPoint {
  researchDate: string;
  scoreTotal: number | null;
}

interface Props {
  data: HistoryPoint[];
}

export function ScoreTrendChart({ data }: Props) {
  if (!data || data.length < 2) {
    return <div className="text-xs text-secondary-500 h-full flex items-center justify-center">keine History</div>;
  }

  const cleaned = data.map((d) => ({
    date: d.researchDate?.slice(0, 10) ?? "",
    score: d.scoreTotal ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={cleaned} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} hide />
        <Tooltip
          contentStyle={{ background: "#020617", border: "1px solid #334155", fontSize: 10 }}
          formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(1) : "-", "Score"]}
        />
        <Area type="monotone" dataKey="score" stroke="#6ee7b7" fill="url(#scoreGrad)" strokeWidth={1.5} dot={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}
