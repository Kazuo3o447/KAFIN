"use client";
/**
 * AuditTabsClient – verwaltet aktiven Tab-State, kapselt AuditTabs + Detail-Pane
 * inkl. Indikator-Begründungen je Block.
 */
import { useState } from "react";
import { AuditTabs } from "@/components/AuditTabs";
import { GlassCard } from "@/components/GlassCard";
import type { BlockKey } from "@/lib/scoring/weights";
import type { BlockAudit } from "@/lib/schemas/report";

interface Props {
  breakdown: Record<BlockKey, number>;
  maxima: Record<BlockKey, number>;
  labels: Record<BlockKey, string>;
  audits: BlockAudit[];
}

export function AuditTabsClient({ breakdown, maxima, labels, audits }: Props) {
  const [active, setActive] = useState<BlockKey>("growth_market");
  const value = breakdown[active] ?? 0;
  const max = maxima[active] ?? 1;
  const pct = Math.round((value / max) * 100);
  const audit = audits.find((a) => a.block === active);

  return (
    <div>
      <AuditTabs active={active} onSelect={setActive} values={breakdown} maxima={maxima} />
      <GlassCard className="p-5 mt-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-medium text-secondary-100">{labels[active]}</div>
            <div className="text-xs text-secondary-500">Block-Score</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">
              {value.toFixed(1)}{" "}
              <span className="text-sm font-normal text-secondary-500">/ {max}</span>
            </div>
            <div className="text-xs text-secondary-500">{pct} %</div>
          </div>
        </div>
        <div className="h-2 bg-secondary-800 rounded overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-400"
            style={{ width: `${pct}%` }}
          />
        </div>

        {audit && audit.indicators.length > 0 ? (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wide text-secondary-500">
                Indikatoren · {audit.indicators.length}
              </h3>
              <span className="text-xs text-secondary-500">
                Confidence · {audit.confidence}
              </span>
            </div>
            <ul className="divide-y divide-secondary-800/60">
              {audit.indicators.map((ind, i) => (
                <li key={`${ind.name}-${i}`} className="py-2.5 flex gap-3">
                  <div className="w-12 shrink-0 text-right">
                    {ind.score === null ? (
                      <span className="text-xs text-secondary-600">n/a</span>
                    ) : (
                      <span className="font-mono text-sm text-accent-400">
                        {ind.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-secondary-100">{ind.name}</div>
                    {ind.rationale ? (
                      <div className="text-xs text-secondary-400 mt-0.5">{ind.rationale}</div>
                    ) : null}
                    {ind.sourceIdx.length > 0 ? (
                      <div className="text-xs text-secondary-600 mt-0.5 font-mono">
                        Quellen: {ind.sourceIdx.map((n) => `[${n}]`).join(" ")}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {audit.hard_blockers.length > 0 ? (
              <div className="mt-3 p-3 rounded border border-red-700/40 bg-red-900/20">
                <div className="text-xs uppercase tracking-wide text-red-300 mb-1">
                  Hard Blockers
                </div>
                <ul className="text-xs text-red-200/90 space-y-0.5">
                  {audit.hard_blockers.map((b, i) => (
                    <li key={i}>· {b}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-secondary-500 mt-4">
            Keine Indikator-Details für diesen Block verfügbar.
          </p>
        )}
      </GlassCard>
    </div>
  );
}
