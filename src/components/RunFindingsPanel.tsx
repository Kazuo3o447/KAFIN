"use client";
/**
 * RunFindingsPanel – "Bisher gefunden" Seitenleiste.
 * Füllt sich progressiv aus Meta- und StepDone-Events:
 *   • Firmenname, Börse, Währung (aus MetaEvent)
 *   • Datenquellen-Chips (aus MetaEvent.sources oder ProviderResults)
 *   • Erste Kennzahlen-Summaries aus StepDone-Events (key="metrics")
 *   • Bewertungs-Kennzahlen aus step "score"
 */
import React from "react";

export interface RunMeta {
  ticker: string;
  companyName?: string | null;
  exchange?: string | null;
  currency?: string | null;
  sources?: string[];
}

interface Props {
  meta: RunMeta | null;
  stepSummaries: Map<string, string>;
  /** Gesamtanzahl gefundener Datenquellen (aus fetch step) */
  sourceCount?: number;
}

// Quelle → Anzeigename
const SOURCE_LABELS: Record<string, string> = {
  edgar: "EDGAR",
  fmp: "FMP",
  finnhub: "Finnhub",
  yahoo: "Yahoo Finance",
  polygon: "Polygon",
};

function Chip({ label, variant = "default" }: { label: string; variant?: "default" | "green" }) {
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded text-[10px] font-mono border",
        variant === "green"
          ? "border-accent-green/40 text-accent-green bg-accent-green/10"
          : "border-secondary-700 text-secondary-400 bg-secondary-900",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 text-[11px]">
      <span className="text-secondary-500 font-mono">{label}</span>
      <span className="text-secondary-200 font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Parst eine Summary-Zeichenfolge wie "RevYoY 12.3% · ROIC 18.4% · FCF-Marge 22.1%"
 * in strukturierte Zeilen für MetricRow.
 */
function parseSummaryToRows(summary: string): Array<{ label: string; value: string }> {
  return summary
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // Versuche Label und Wert zu trennen (letztes Token = Wert)
      const tokens = part.split(/\s+/);
      const value = tokens[tokens.length - 1] ?? part;
      const label = tokens.slice(0, -1).join(" ") || part;
      return { label, value };
    });
}

export function RunFindingsPanel({ meta, stepSummaries, sourceCount }: Props) {
  const hasAnything = meta !== null;

  if (!hasAnything) {
    return (
      <div className="rounded-xl border border-secondary-800 bg-secondary-950 p-4 h-full">
        <div className="text-[10px] uppercase tracking-widest text-secondary-600 font-bold mb-3">
          Bisher gefunden
        </div>
        <div className="text-secondary-700 text-xs font-mono">
          Warte auf Daten…
        </div>
      </div>
    );
  }

  const metricsSummary = stepSummaries.get("metrics");
  const scoreSummary = stepSummaries.get("score");
  const metricRows = metricsSummary ? parseSummaryToRows(metricsSummary) : [];
  const scoreRows = scoreSummary ? parseSummaryToRows(scoreSummary) : [];

  const sources = meta.sources ?? [];

  return (
    <div className="rounded-xl border border-secondary-800 bg-secondary-950 p-4 h-full flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-secondary-600 font-bold mb-2">
          Bisher gefunden
        </div>

        {/* Company identity */}
        <div className="mb-1">
          {meta.companyName && (
            <div className="text-white font-semibold text-sm truncate">{meta.companyName}</div>
          )}
          <div className="text-secondary-400 text-xs font-mono mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{meta.ticker}</span>
            {meta.exchange && <span>· {meta.exchange}</span>}
            {meta.currency && <span>· {meta.currency}</span>}
          </div>
        </div>
      </div>

      {/* Data sources */}
      {(sources.length > 0 || sourceCount != null) && (
        <div>
          <div className="text-[10px] text-secondary-600 uppercase tracking-widest mb-1.5">Quellen</div>
          <div className="flex flex-wrap gap-1.5">
            {sources.length > 0
              ? sources.map((src) => (
                  <Chip
                    key={src}
                    label={SOURCE_LABELS[src.toLowerCase()] ?? src}
                    variant="green"
                  />
                ))
              : sourceCount != null && (
                  <Chip label={`${sourceCount} Quellen`} variant="green" />
                )}
          </div>
        </div>
      )}

      {/* Key metrics from "metrics" step */}
      {metricRows.length > 0 && (
        <div>
          <div className="text-[10px] text-secondary-600 uppercase tracking-widest mb-1.5">Kennzahlen</div>
          <div className="space-y-1">
            {metricRows.map((row) => (
              <MetricRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      )}

      {/* Score/gate from "score" step */}
      {scoreRows.length > 0 && (
        <div>
          <div className="text-[10px] text-secondary-600 uppercase tracking-widest mb-1.5">Scoring</div>
          <div className="space-y-1">
            {scoreRows.map((row) => (
              <MetricRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
