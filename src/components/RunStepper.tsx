"use client";
/**
 * RunStepper – Terminal-artiger Step-Fortschrittsbalken.
 * Zeigt alle 14 Pipeline-Steps in 3 Phasengruppen. Status wird aus SSE-Events abgeleitet:
 *   pending  → step noch nicht gestartet
 *   active   → step:start empfangen, step:done noch nicht da
 *   done     → step:done ok=true
 *   warn     → step:done ok=false (non-fatal)
 *   failed   → hard error event
 */
import React, { useRef } from "react";
import { STEP_MANIFEST, PHASE_LABELS, type StepMeta, type StepPhase } from "@/lib/orchestrator/step-manifest";

type StepStatus = "pending" | "active" | "done" | "warn";

export interface StepState {
  key: string;
  status: StepStatus;
  ms?: number;
  summary?: string;
  /** Current log line while active — fed from LogPanel lines */
  currentLog?: string;
}

interface Props {
  stepStates: Map<string, StepState>;
  /** Last log message — shown under the currently active step */
  latestLog?: string;
  prefersReducedMotion?: boolean;
}

const PHASE_ORDER: StepPhase[] = ["data", "analysis", "valuation"];

function msLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({
  step,
  state,
  latestLog,
  prefersReducedMotion,
}: {
  step: StepMeta;
  state: StepState;
  latestLog?: string;
  prefersReducedMotion?: boolean;
}) {
  const isActive = state.status === "active";

  return (
    <li
      className={[
        "flex items-start gap-3 px-4 py-2 rounded transition-colors duration-200",
        isActive ? "bg-secondary-900/60" : "",
        state.status === "pending" ? "opacity-40" : "opacity-100",
      ].join(" ")}
      aria-label={`${step.label}: ${state.status}`}
    >
      {/* Status icon */}
      <span aria-hidden="true" className="mt-0.5 w-5 shrink-0 text-center text-sm leading-none">
        {state.status === "done" && (
          <span className="text-accent-green font-bold">✓</span>
        )}
        {state.status === "warn" && (
          <span className="text-amber-400 font-bold">△</span>
        )}
        {state.status === "active" && (
          <span
            className={[
              "inline-block text-accent-cyan",
              prefersReducedMotion ? "" : "animate-spin",
            ].join(" ")}
          >
            ◌
          </span>
        )}
        {state.status === "pending" && (
          <span className="text-secondary-500">○</span>
        )}
      </span>

      {/* Label + details */}
      <span className="flex-1 min-w-0">
        <span
          className={[
            "text-xs font-mono",
            state.status === "done" ? "text-secondary-200" : "",
            state.status === "active" ? "text-white font-semibold" : "",
            state.status === "pending" ? "text-secondary-500" : "",
            state.status === "warn" ? "text-amber-300" : "",
          ].join(" ")}
        >
          {step.label}
        </span>

        {/* ms on completion */}
        {(state.status === "done" || state.status === "warn") && state.ms != null && (
          <span className="ml-2 text-[10px] text-secondary-500 font-mono">
            {msLabel(state.ms)}
          </span>
        )}

        {/* Summary line on done */}
        {(state.status === "done" || state.status === "warn") && state.summary && (
          <div className="text-[10px] text-secondary-400 font-mono mt-0.5 truncate">
            {state.summary}
          </div>
        )}

        {/* Live log line for active step */}
        {isActive && latestLog && (
          <div className="text-[10px] text-accent-cyan/70 font-mono mt-0.5 truncate" aria-live="polite">
            {latestLog}
          </div>
        )}
      </span>
    </li>
  );
}

export function RunStepper({ stepStates, latestLog, prefersReducedMotion }: Props) {
  const activeRef = useRef<HTMLLIElement | null>(null);

  // Find active step key to attach ref for scrolling
  const activeKey = STEP_MANIFEST.find((s) => stepStates.get(s.key)?.status === "active")?.key;

  return (
    <div className="font-mono">
      {PHASE_ORDER.map((phase) => {
        const phaseSteps = STEP_MANIFEST.filter((s) => s.phase === phase);
        const phaseDone = phaseSteps.every((s) => {
          const st = stepStates.get(s.key)?.status;
          return st === "done" || st === "warn";
        });
        const phaseActive = !phaseDone && phaseSteps.some(
          (s) => stepStates.get(s.key)?.status === "active" || stepStates.get(s.key)?.status === "done" || stepStates.get(s.key)?.status === "warn"
        );

        return (
          <div key={phase} className="mb-5">
            {/* Phase header */}
            <div className="flex items-center gap-2 px-4 mb-1">
              <span
                className={[
                  "text-[10px] uppercase tracking-widest font-bold",
                  phaseDone
                    ? "text-accent-green"
                    : phaseActive
                    ? "text-accent-cyan"
                    : "text-secondary-600",
                ].join(" ")}
              >
                {PHASE_LABELS[phase]}
              </span>
              <div
                className={[
                  "flex-1 h-px",
                  phaseDone
                    ? "bg-accent-green/30"
                    : phaseActive
                    ? "bg-accent-cyan/20"
                    : "bg-secondary-800",
                ].join(" ")}
              />
            </div>

            {/* Steps */}
            <ul role="list" className="space-y-0.5">
              {phaseSteps.map((step) => {
                const state = stepStates.get(step.key) ?? { key: step.key, status: "pending" as const };
                return (
                  <React.Fragment key={step.key}>
                    {/* attach ref for active step */}
                    {step.key === activeKey ? (
                      <span ref={(el) => { if (el) activeRef.current = el.previousElementSibling as HTMLLIElement | null; }} className="sr-only" />
                    ) : null}
                    <StepRow
                      step={step}
                      state={state}
                      latestLog={state.status === "active" ? latestLog : undefined}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  </React.Fragment>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
