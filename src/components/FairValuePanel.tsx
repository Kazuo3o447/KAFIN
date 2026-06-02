/**
 * FairValuePanel – zeigt aktuellen Preis, Fair-Value-Range und Skala.
 * Phase F.4
 */
"use client";

import React from "react";
import type { Report } from "@/lib/schemas/report";
import type { KeyMetrics } from "@/lib/schemas/report";

type FairValue = NonNullable<Report["fair_value"]>;

const CLASSIFICATION_COLOR: Record<string, string> = {
  deep_value: "#22c55e",
  value: "#4ade80",
  fair: "#94a3b8",
  premium: "#f59e0b",
  overvalued: "#ef4444",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  deep_value: "Deutlich unter Fair Value",
  value: "Unter Fair Value",
  fair: "Im Fair-Value-Bereich",
  premium: "Leicht über Fair Value",
  overvalued: "Über Fair Value",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "text-secondary-300",
  medium: "text-secondary-400",
  low: "text-secondary-500",
};

interface Props {
  fairValue: FairValue | null;
  keyMetrics?: Partial<KeyMetrics>;
  reverseDcf?: Report["reverse_dcf"];
  isPrint?: boolean;
}

function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return v.toFixed(d);
}

function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return `${(v * 100).toFixed(d)}%`;
}

export function FairValuePanel({ fairValue, keyMetrics, reverseDcf, isPrint }: Props) {
  const km = keyMetrics;

  if (!fairValue || fairValue.point_estimate === null) {
    return (
      <div className="glass-card p-4 h-full flex items-center justify-center">
        <p className="text-sm text-secondary-500 text-center">
          Fair Value nicht modellierbar — Grund: zu wenig Peer-Daten oder Input-Reihen fehlen.
          <br />
          <span className="text-xs">Fallback: Multiples-only / PEG-Leiter anzeigen.</span>
        </p>
      </div>
    );
  }

  const {
    current_price,
    point_estimate,
    range_low,
    range_high,
    upside_pct,
    classification,
    confidence,
    applicable_method_count,
    rationale_short,
    currency,
  } = fairValue;

  const color = classification ? (CLASSIFICATION_COLOR[classification] ?? "#94a3b8") : "#94a3b8";
  const classLabel = classification ? (CLASSIFICATION_LABEL[classification] ?? classification) : "";

  // Upside formatting
  const upsideStr =
    upside_pct !== null
      ? `${upside_pct >= 0 ? "+" : ""}${(upside_pct * 100).toFixed(1)} %`
      : "—";

  // Scale marker: clamp (-50% … +50%) to 0%…100%
  let markerPct: number | null = null;
  let offScale = false;
  if (upside_pct !== null) {
    if (upside_pct < -0.5 || upside_pct > 0.5) {
      offScale = true;
      markerPct = upside_pct < 0 ? 0 : 100;
    } else {
      markerPct = Math.round(((upside_pct + 0.5) / 1.0) * 100);
    }
  }

  const applicableNames = fairValue.methods
    .filter((m) => m.applicable)
    .map((m) => {
      if (m.name === "ev_sales") return "EV/Sales";
      if (m.name === "ev_gross_profit") return "EV/GP";
      return "Fwd P/E";
    })
    .join(", ");

  const pegFallbackText = (() => {
    const level = km?.peg_fallback_level;
    if (level === 1) return `PEG forward ${fmtNum(km?.peg)}`;
    if (level === 2) return `EV/EBIT-to-Growth ${fmtNum(km?.ev_ebit_to_growth)}`;
    if (level === 2.5) return `FCF-PEG ${fmtNum(km?.fcf_peg)}`;
    if (level === 3) return `EV/GP ${fmtNum(km?.ev_gross_profit)}`;
    if (level === 4) return `EV/Sales-to-Growth ${fmtNum(km?.ev_sales_to_growth)}`;
    if (km?.fcf_peg != null) return `PEG n/a → FCF-PEG ${fmtNum(km.fcf_peg)}`;
    return "PEG n/a — kein positiver Gewinn/Wachstum oder keine Estimates";
  })();

  const reverseImplied = reverseDcf?.implied_growth_rate ?? fairValue.reverse_dcf?.implied_fcf_cagr ?? null;
  const asymmetry = km?.reverse_dcf_asymmetry ?? null;

  const priceStr = (v: number) =>
    v >= 1000
      ? v.toLocaleString("de-DE", { maximumFractionDigits: 0 })
      : v.toFixed(2);

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-secondary-500 mb-0.5">
            Fair Value · {applicable_method_count} Methode{applicable_method_count !== 1 ? "n" : ""}
          </div>
          {current_price !== null && (
            <div className="text-2xl font-semibold font-mono text-secondary-100">
              {priceStr(current_price)}{" "}
              <span className="text-sm font-normal text-secondary-400">{currency}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest text-secondary-500 mb-0.5">
            Modellwert
          </div>
          <div className="text-lg font-medium font-mono" style={{ color }}>
            {priceStr(point_estimate)} {currency}
          </div>
          {range_low !== null && range_high !== null && (
            <div className="text-xs text-secondary-500">
              {priceStr(range_low)} – {priceStr(range_high)}
            </div>
          )}
        </div>
      </div>

      {/* Upside */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-secondary-500">Abw.</span>
        <span className="text-sm font-semibold" style={{ color }}>
          {upsideStr}
        </span>
        {classLabel && (
          <span className="text-[11px] text-secondary-400 ml-1">{classLabel}</span>
        )}
      </div>

      {/* Scale bar */}
      {markerPct !== null && (
        <div className="relative fair-value-scale">
          {/* 3-zone bar */}
          <div className="flex h-2 rounded overflow-hidden w-full">
            <div className="flex-1 bg-green-700/40" />
            <div className="flex-1 bg-amber-700/30" />
            <div className="flex-1 bg-red-700/40" />
          </div>
          {/* Marker */}
          <div
            className="absolute top-0 w-0.5 h-2 bg-white/90"
            style={{ left: `${markerPct}%`, transform: "translateX(-50%)" }}
            data-fv-marker-position={markerPct}
            title={offScale ? `${upsideStr} (off-scale)` : upsideStr}
          />
          {offScale && (
            <span className="text-[10px] text-secondary-500 absolute -bottom-4"
              style={{ left: markerPct === 0 ? "0" : "auto", right: markerPct === 100 ? "0" : "auto" }}>
              {upsideStr} (off-scale)
            </span>
          )}
          {/* Scale labels */}
          <div className="flex justify-between mt-1 text-[10px] text-secondary-600">
            <span>−50 %</span>
            <span>0 %</span>
            <span>+50 %</span>
          </div>
        </div>
      )}

      {/* Confidence + methods */}
      <div className={`text-[11px] ${CONFIDENCE_STYLE[confidence] ?? "text-secondary-500"} mt-1`}>
        Confidence {confidence}
        {applicableNames ? ` · ${applicableNames}` : ""}
      </div>

      {/* Multiples / Ladder bridge */}
      <div className="grid grid-cols-2 gap-2 border-t border-secondary-800 pt-2 text-[11px]">
        <div className="space-y-0.5 text-secondary-300">
          <div>EV/Sales: {fmtNum(km?.ev_sales)}</div>
          <div>EV/GP: {fmtNum(km?.ev_gross_profit)}</div>
          <div>EV/EBIT: {fmtNum(km?.ev_ebit)}</div>
          <div>NTM P/E: {fmtNum(km?.ntm_pe)}</div>
        </div>
        <div className="space-y-0.5 text-secondary-300">
          <div>PEG: {fmtNum(km?.peg)}</div>
          <div>FCF-PEG: {fmtNum(km?.fcf_peg)}</div>
          <div>EV/FCF: {fmtNum(km?.ev_fcf)}</div>
          <div>FCF Yield: {fmtPct(km?.fcf_margin)}</div>
        </div>
      </div>

      <div className="text-[11px] text-secondary-400 border-t border-secondary-800 pt-2">
        PEG-Leiter: {pegFallbackText}
      </div>

      {/* Rationale */}
      {!isPrint && rationale_short && (
        <div className="text-[10px] text-secondary-600 leading-tight border-t border-secondary-800 pt-2">
          {rationale_short}
        </div>
      )}

      {/* Reverse-DCF annotation */}
      {(fairValue.reverse_dcf?.classification || reverseDcf?.classification || asymmetry !== null) && (
        <div className="text-[11px] text-secondary-500 border-t border-secondary-800 pt-2">
          Reverse-DCF: {reverseImplied !== null
            ? `${(reverseImplied * 100).toFixed(1)} % impliziertes Wachstum`
            : "—"}{" "}
          ({reverseDcf?.classification ?? fairValue.reverse_dcf?.classification ?? "unknown"})
          {asymmetry !== null && (
            <span className={asymmetry >= 0 ? "text-emerald-300" : "text-rose-300"}>
              {" "}· GARP-Asymmetrie {asymmetry >= 0 ? "+" : ""}{(asymmetry * 100).toFixed(1)}pp
            </span>
          )}
        </div>
      )}

      {(km?.wacc !== null || fairValue.reverse_dcf?.terminal_growth !== null) && (
        <div className="text-[11px] text-secondary-500">
          WACC {fmtPct(km?.wacc)} · Terminal Growth {fmtPct(fairValue.reverse_dcf?.terminal_growth)}
        </div>
      )}
    </div>
  );
}
