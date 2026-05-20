"use client";
/**
 * AuditTabs – horizontale Tab-Bar A-G mit Score-Dots.
 * Pilot-Style aus 1index.html (.audit-tabs-bar / .audit-tab).
 */
import { BLOCK_LABELS, type BlockKey } from "@/lib/scoring/weights";

const ORDER: BlockKey[] = [
  "growth_market",
  "unit_economics_margins",
  "quality_moat",
  "valuation",
  "capital_discipline_dilution",
  "catalysts_revisions_sentiment",
  "risk_fragility",
];

const LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

interface Props {
  active: BlockKey;
  onSelect: (k: BlockKey) => void;
  /** Erreichte Punkte je Block (gleicher Maßstab wie BLOCK_WEIGHTS). */
  values: Record<BlockKey, number>;
  /** Maximalpunkte je Block. */
  maxima: Record<BlockKey, number>;
}

function dotColor(ratio: number): string {
  if (ratio >= 0.75) return "#22c55e";
  if (ratio >= 0.5) return "#f59e0b";
  return "#ef4444";
}

export function AuditTabs({ active, onSelect, values, maxima }: Props) {
  return (
    <div className="audit-tabs-bar" role="tablist">
      {ORDER.map((k, i) => {
        const max = maxima[k] || 1;
        const ratio = (values[k] ?? 0) / max;
        return (
          <button
            type="button"
            key={k}
            role="tab"
            aria-selected={active === k}
            className={`audit-tab ${active === k ? "active" : ""}`}
            onClick={() => onSelect(k)}
          >
            <span className="font-mono text-xs opacity-70">{LETTERS[i]}</span>
            <span>{BLOCK_LABELS[k]}</span>
            <span className="audit-tab-score-dot" style={{ background: dotColor(ratio) }} />
          </button>
        );
      })}
    </div>
  );
}
