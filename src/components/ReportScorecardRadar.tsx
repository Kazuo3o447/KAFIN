"use client";

import React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { Report } from "@/lib/schemas/report";

type Axis = NonNullable<Report["axes"]>[number];
type SafetyGate = NonNullable<Report["safety_gate"]>;

interface RadarPoint {
  axis: string;
  value: number;
  thin: boolean;
}

interface Props {
  axes: Axis[];
  scoreHeatmap: Array<Record<string, unknown>>;
  safetyGate: SafetyGate | null;
  confidenceScore: number | null;
  dataQualityCoverage: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function heatValue(heat: Array<Record<string, unknown>>, block: string): number | null {
  const row = heat.find((h) => h.block === block);
  if (!row) return null;
  const n = num(row.normalizedScore);
  return n === null ? null : Math.max(0, Math.min(100, n));
}

function axisCombined(axes: Axis[], key: "growth" | "finance" | "moat"): number | null {
  const a = axes.find((x) => x.axis === key);
  if (!a) return null;
  return a.combined;
}

function axisThin(axes: Axis[], key: "growth" | "finance" | "moat"): boolean {
  const a = axes.find((x) => x.axis === key);
  if (!a) return true;
  return (a.quant.coverage ?? 0) < 0.5;
}

function buildRadarData(axes: Axis[], heat: Array<Record<string, unknown>>): { data: RadarPoint[]; fromFallback: boolean } {
  const hasAxes = Array.isArray(axes) && axes.length > 0;

  if (hasAxes) {
    const growth = axisCombined(axes, "growth");
    const finance = axisCombined(axes, "finance");
    const moat = axisCombined(axes, "moat");
    const valuation = heatValue(heat, "valuation");
    const momentum = heatValue(heat, "catalysts_revisions_sentiment");

    return {
      fromFallback: false,
      data: [
        { axis: "Growth", value: growth ?? 0, thin: axisThin(axes, "growth") },
        { axis: "Finance", value: finance ?? 0, thin: axisThin(axes, "finance") },
        { axis: "Moat", value: moat ?? 0, thin: axisThin(axes, "moat") },
        { axis: "Bewertung", value: valuation ?? 0, thin: valuation === null },
        { axis: "Momentum", value: momentum ?? 0, thin: momentum === null },
      ],
    };
  }

  const growth = heatValue(heat, "growth_market");
  const financeParts = [
    heatValue(heat, "unit_economics_margins"),
    heatValue(heat, "capital_discipline_dilution"),
    heatValue(heat, "risk_fragility"),
  ].filter((v): v is number => v !== null);
  const finance = financeParts.length > 0 ? financeParts.reduce((s, v) => s + v, 0) / financeParts.length : null;
  const moat = heatValue(heat, "quality_moat");
  const valuation = heatValue(heat, "valuation");
  const momentum = heatValue(heat, "catalysts_revisions_sentiment");

  return {
    fromFallback: true,
    data: [
      { axis: "Growth", value: growth ?? 0, thin: growth === null },
      { axis: "Finance", value: finance ?? 0, thin: finance === null },
      { axis: "Moat", value: moat ?? 0, thin: moat === null },
      { axis: "Bewertung", value: valuation ?? 0, thin: valuation === null },
      { axis: "Momentum", value: momentum ?? 0, thin: momentum === null },
    ],
  };
}

function statusTone(v: number | null): "ok" | "warn" | "bad" {
  if (v === null) return "warn";
  if (v >= 70) return "ok";
  if (v >= 45) return "warn";
  return "bad";
}

function toneClass(t: "ok" | "warn" | "bad"): string {
  if (t === "ok") return "text-emerald-300 border-emerald-700/50 bg-emerald-900/20";
  if (t === "warn") return "text-amber-300 border-amber-700/50 bg-amber-900/20";
  return "text-rose-300 border-rose-700/50 bg-rose-900/20";
}

export function ReportScorecardRadar({
  axes,
  scoreHeatmap,
  safetyGate,
  confidenceScore,
  dataQualityCoverage,
}: Props) {
  const { data, fromFallback } = buildRadarData(axes, scoreHeatmap);
  const growth = data.find((d) => d.axis === "Growth")?.value ?? null;
  const finance = data.find((d) => d.axis === "Finance")?.value ?? null;
  const moat = data.find((d) => d.axis === "Moat")?.value ?? null;

  const confidence = confidenceScore ?? (dataQualityCoverage !== null ? Math.round(dataQualityCoverage * 100) : null);
  const confTone = statusTone(confidence);

  const gate = safetyGate?.status ?? "warn";
  const gateClass =
    gate === "ok"
      ? "text-emerald-300 border-emerald-700/50 bg-emerald-900/20"
      : gate === "warn"
        ? "text-amber-300 border-amber-700/50 bg-amber-900/20"
        : "text-rose-300 border-rose-700/50 bg-rose-900/20";

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[360px_1fr]" aria-live="polite">
      <div className="h-[260px] border border-secondary-800 bg-secondary-950/30 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Score" dataKey="value" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {[{ k: "Growth", v: growth }, { k: "Finance", v: finance }, { k: "Moat", v: moat }].map((c) => {
            const t = statusTone(c.v);
            return (
              <span key={c.k} className={`border px-2 py-1 text-[11px] ${toneClass(t)}`}>
                {c.k}: {c.v !== null ? c.v.toFixed(0) : "n/a"}
              </span>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`border px-2 py-1 text-[11px] ${gateClass}`}>
            Safety-Gate: {gate}
          </span>
          <span className={`border px-2 py-1 text-[11px] ${toneClass(confTone)}`}>
            Daten-Confidence: {confidence !== null ? `${confidence}/100` : "n/a"}
          </span>
        </div>

        {safetyGate?.reasons && safetyGate.reasons.length > 0 && (
          <div className="border border-secondary-800 bg-secondary-950/30 p-2 text-[11px] text-secondary-300">
            {safetyGate.reasons.join(" · ")}
          </div>
        )}

        {data.some((d) => d.thin) && (
          <div className="text-[11px] text-amber-300">Daten dünn: einzelne Speichen sind nur mit begrenzter Datenbasis bewertet.</div>
        )}

        {fromFallback && (
          <div className="text-[11px] text-secondary-400">Achsen-Scoring ausstehend: Übergangs-Radar aus Score-Heatmap.</div>
        )}
      </div>
    </div>
  );
}
