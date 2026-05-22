/**
 * BlockOverviewBars – always-visible horizontal block bars.
 * Click to expand inline indicator list.
 * Phase F.4
 */
"use client";
import { useState, useEffect } from "react";
import type { BlockAudit } from "@/lib/schemas/report";
import type { BlockKey } from "@/lib/scoring/weights";
import { BLOCK_WEIGHTS, BLOCK_LABELS } from "@/lib/scoring/weights";
import { blockerToBlock } from "@/lib/research/verdict";

const BLOCK_LETTERS: Record<BlockKey, string> = {
  growth_market: "A",
  unit_economics_margins: "B",
  quality_moat: "C",
  valuation: "D",
  capital_discipline_dilution: "E",
  catalysts_revisions_sentiment: "F",
  risk_fragility: "G",
};

/** Find auto-expand block: hard-blocker block → or weakest relative block → or null if all ≥ 75% */
export function findAutoExpandBlock(
  breakdown: Record<BlockKey, number>,
  hardBlockers: string[],
): BlockKey | null {
  // 1. Hard blockers take precedence
  for (const hb of hardBlockers) {
    const block = blockerToBlock(hb);
    if (block) return block;
  }

  // 2. Worst relative score-gap
  let worst: BlockKey | null = null;
  let worstGap = 0;

  for (const key of Object.keys(BLOCK_WEIGHTS) as BlockKey[]) {
    const max = BLOCK_WEIGHTS[key];
    const actual = breakdown[key] ?? 0;
    const relativeGap = max > 0 ? (max - actual) / max : 0;
    if (relativeGap > worstGap) {
      worstGap = relativeGap;
      worst = key;
    }
  }

  // 3. If all blocks ≥ 75 % fulfilled → no auto-expand
  if (worstGap < 0.25) return null;

  return worst;
}

interface Props {
  audits: BlockAudit[];
  breakdown: Record<BlockKey, number>;
  hardBlockers: string[];
  autoExpandBlock?: BlockKey;
  isPrint?: boolean;
}

export function BlockOverviewBars({
  audits,
  breakdown,
  hardBlockers,
  autoExpandBlock: externalOverride,
  isPrint = false,
}: Props) {
  const defaultExpand = externalOverride ?? findAutoExpandBlock(breakdown, hardBlockers);
  const [expanded, setExpanded] = useState<BlockKey | null>(isPrint ? null : defaultExpand);

  // In print mode all are expanded
  useEffect(() => {
    if (isPrint) setExpanded(null); // signals "all open" below
  }, [isPrint]);

  const auditMap = new Map(audits.map((a) => [a.block, a]));

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-secondary-800">
        <h2 className="text-sm uppercase tracking-wide text-secondary-500">Block-Übersicht</h2>
      </div>
      <div className="divide-y divide-secondary-800/60">
        {(Object.keys(BLOCK_WEIGHTS) as BlockKey[]).map((key) => {
          const max = BLOCK_WEIGHTS[key];
          const actual = breakdown[key] ?? 0;
          const pct = max > 0 ? Math.min(100, (actual / max) * 100) : 0;
          const audit = auditMap.get(key);
          const hasBlocker = (audit?.hard_blockers.length ?? 0) > 0;
          const isExpanded = isPrint || expanded === key;
          const letter = BLOCK_LETTERS[key];

          const barColor =
            pct >= 75 ? "#22c55e" :
            pct >= 50 ? "#f59e0b" :
            "#ef4444";

          return (
            <div key={key} className={`${isExpanded ? "bg-secondary-900/40" : ""}`}>
              {/* Block row */}
              <button
                type="button"
                onClick={() => !isPrint && setExpanded(isExpanded ? null : key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary-800/20 transition-colors"
                aria-expanded={isExpanded}
                data-block={key}
              >
                {/* Letter badge */}
                <span className="text-xs font-mono text-secondary-400 w-4 shrink-0">{letter}</span>

                {/* Label */}
                <span className={`text-sm flex-1 ${hasBlocker ? "text-red-400" : "text-secondary-200"}`}>
                  {BLOCK_LABELS[key]}
                  {hasBlocker && <span className="ml-1 text-red-500">⛔</span>}
                </span>

                {/* Bar */}
                <div className="w-24 h-2 bg-secondary-800 rounded overflow-hidden shrink-0">
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>

                {/* Score */}
                <span className="text-xs font-mono text-secondary-400 w-16 text-right shrink-0">
                  {actual.toFixed(1)}/{max}
                </span>

                {/* Chevron */}
                {!isPrint && (
                  <span className="text-secondary-600 text-xs shrink-0">
                    {isExpanded ? "▴" : "▾"}
                  </span>
                )}
              </button>

              {/* Inline indicator list */}
              {isExpanded && audit && (
                <div className="px-4 pb-4 space-y-2">
                  {audit.hard_blockers.map((hb, i) => (
                    <div key={i} className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
                      ⛔ {hb}
                    </div>
                  ))}
                  {audit.red_flags.map((rf, i) => (
                    <div key={i} className="text-xs text-amber-400 bg-amber-900/10 px-2 py-1 rounded">
                      ⚠ {rf}
                    </div>
                  ))}
                  {audit.indicators.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {audit.indicators.map((ind, i) => (
                        <div key={i} className="flex items-start gap-3 text-xs py-1 border-b border-secondary-800/50">
                          <span className="text-secondary-400 flex-1">{ind.name}</span>
                          <span className={`font-mono w-8 text-right ${
                            ind.score === null ? "text-secondary-600" :
                            ind.score >= 7 ? "text-green-400" :
                            ind.score >= 5 ? "text-amber-400" : "text-red-400"
                          }`}>
                            {ind.score !== null ? ind.score.toFixed(0) : "—"}
                          </span>
                          <span className="text-secondary-500 flex-[2]">{ind.rationale}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {audit.confidence !== "high" && (
                    <div className="text-xs text-secondary-500 italic">
                      Block-Confidence: {audit.confidence}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
