/**
 * AxesScorecardCard – 3-Achsen Scorecard (Growth / Finance / Moat)
 * Zeigt Quant + KI dual-bars, Divergence-Chip, Safety-Gate.
 */
"use client";

import React from "react";
import type { Report } from "@/lib/schemas/report";

type Axis = NonNullable<Report["axes"]>[number];
type SafetyGate = NonNullable<Report["safety_gate"]>;

interface Props {
  axes: Axis[];
  safetyGate: SafetyGate | null;
  archetype?: string | null;
}

const AXIS_LABEL: Record<string, string> = {
  growth: "Wachstum",
  finance: "Finanzen",
  moat: "Burggraben",
};

const GATE_COLOR: Record<string, string> = {
  ok: "text-emerald-300 border-emerald-700/60",
  warn: "text-amber-300 border-amber-700/60",
  blocked: "text-rose-300 border-rose-700/60",
};

const GATE_LABEL: Record<string, string> = {
  ok: "Safety OK",
  warn: "Safety WARN",
  blocked: "GEBLOCKT",
};

function DualBar({ quant, ki }: { quant: number | null; ki: number | null }) {
  const qPct = quant !== null ? Math.max(0, Math.min(100, quant)) : 0;
  const kPct = ki !== null ? Math.max(0, Math.min(100, ki)) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative h-1.5 bg-secondary-900 rounded-sm overflow-hidden" title={`Quant: ${qPct.toFixed(0)}`}>
        <div className="absolute left-0 top-0 h-full bg-accent-400 rounded-sm" style={{ width: `${qPct}%` }} />
      </div>
      {kPct !== null && (
        <div className="relative h-1 bg-secondary-900 rounded-sm overflow-hidden" title={`KI: ${kPct.toFixed(0)}`}>
          <div className="absolute left-0 top-0 h-full bg-amber-400/70 rounded-sm" style={{ width: `${kPct}%` }} />
        </div>
      )}
    </div>
  );
}

function DivergenceChip({ divergence }: { divergence: number | null }) {
  if (divergence === null) return null;
  const abs = Math.abs(divergence);
  const color = abs > 20 ? "text-rose-300 border-rose-700/50" : abs > 10 ? "text-amber-300 border-amber-700/50" : "text-secondary-400 border-secondary-700";
  return (
    <span className={`border px-1 py-0.5 text-[10px] ${color}`}>
      Δ{divergence > 0 ? "+" : ""}{divergence.toFixed(0)}
    </span>
  );
}

export function AxesScorecardCard({ axes, safetyGate, archetype }: Props) {
  if (!axes || axes.length === 0) return null;

  const gateStatus = safetyGate?.status ?? "ok";
  const gateStyle = GATE_COLOR[gateStatus] ?? GATE_COLOR.ok;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="uppercase tracking-wide text-secondary-400 text-[11px]">Achsen-Scorecard</span>
        <div className="flex items-center gap-2">
          {archetype && (
            <span className="border border-secondary-700 px-1.5 py-0.5 text-[10px] text-secondary-300">{archetype}</span>
          )}
          <span className={`border px-1.5 py-0.5 text-[10px] ${gateStyle}`}>
            {GATE_LABEL[gateStatus] ?? gateStatus}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {axes.map((ax) => {
          const quantVal = ax.quant.value;
          const kiVal = ax.ki?.value ?? null;
          return (
            <div key={ax.axis} className="space-y-1 border border-secondary-800 bg-secondary-950/40 p-2">
              <div className="flex items-center justify-between">
                <span className="text-secondary-300 text-[11px]">{AXIS_LABEL[ax.axis] ?? ax.axis}</span>
                <DivergenceChip divergence={ax.divergence} />
              </div>
              <DualBar quant={quantVal} ki={kiVal} />
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-secondary-100">
                  {ax.combined !== null ? ax.combined.toFixed(0) : "-"}/100
                </span>
                <span className="text-secondary-400">{ax.rating ?? "-"}</span>
              </div>
              {ax.kiWeightEffective > 0 && (
                <div className="text-[10px] text-secondary-500">
                  KI-Gew {(ax.kiWeightEffective * 100).toFixed(0)}%
                </div>
              )}
            </div>
          );
        })}
      </div>

      {safetyGate && safetyGate.reasons.length > 0 && (
        <div className="border border-amber-800/40 bg-amber-950/10 px-2 py-1 text-[11px] text-amber-200">
          {safetyGate.reasons.join(" · ")}
        </div>
      )}
    </div>
  );
}
