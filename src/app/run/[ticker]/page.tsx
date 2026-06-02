"use client";
/**
 * Run-Page — Research-Ladebildschirm.
 * Terminal-Style 3-Bereich-Layout:
 *   1. Kopfzeile:  Ticker · Elapsed · Progress%
 *   2. Hauptfeld:  RunStepper (links) + RunFindingsPanel (rechts)
 *   3. Fußzeile:   3px Progress-Bar · Log-Toggle
 *
 * SSE-Events: log, progress, step:start, step:done, meta, error, done
 * Buffer-Replay: Zustands-Rekonstruktion aus replayed Events (mehrfache step:done auf einmal)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LogPanel, type LogLine } from "@/components/LogPanel";
import { RunStepper, type StepState } from "@/components/RunStepper";
import { RunFindingsPanel, type RunMeta } from "@/components/RunFindingsPanel";

interface DoneEvent {
  reportId: string;
  gate?: string;
  scoreTotal?: number;
}

const REDIRECT_DELAY_MS = 1200;

function useElapsed(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef<number>(Date.now());
  const raf = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (raf.current) clearInterval(raf.current);
      return;
    }
    t0.current = Date.now();
    setElapsed(0);
    raf.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0.current) / 1000));
    }, 1000);
    return () => {
      if (raf.current) clearInterval(raf.current);
    };
  }, [running]);

  return elapsed;
}

export default function RunPage() {
  const params = useParams<{ ticker: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const ticker = decodeURIComponent(params.ticker ?? "");
  const runId = search.get("runId") ?? "";

  // Core state
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<DoneEvent | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [running, setRunning] = useState(true);

  // Step stepper state
  const [stepStates, setStepStates] = useState<Map<string, StepState>>(new Map());
  const [latestLog, setLatestLog] = useState<string>("");

  // Findings panel state
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [stepSummaries, setStepSummaries] = useState<Map<string, string>>(new Map());

  const esRef = useRef<EventSource | null>(null);

  const elapsed = useElapsed(running && !finished && !error);

  const appendLog = useCallback((level: LogLine["level"], message: string) => {
    setLogs((prev) => [...prev, { ts: Date.now(), level, message }].slice(-1000));
    setLatestLog(message);
  }, []);

  const setStepStatus = useCallback(
    (key: string, updates: Partial<StepState>) => {
      setStepStates((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? { key, status: "pending" as const };
        next.set(key, { ...existing, ...updates, key });
        return next;
      });
    },
    []
  );

  // Detect reduced-motion preference
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    if (!runId) {
      setError("Keine runId in URL.");
      setRunning(false);
      return;
    }
    const es = new EventSource(`/api/runs/${runId}/stream`);
    esRef.current = es;

    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as { level: LogLine["level"]; msg: string };
        appendLog(d.level ?? "info", d.msg);
      } catch { /* ignore */ }
    });

    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as { pct: number };
        // Never set to 100 here — only on done event
        setProgress(Math.min(d.pct, 99));
      } catch { /* ignore */ }
    });

    es.addEventListener("step:start", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as { label: string; step: string };
        setStepStatus(d.step, { status: "active" });
        appendLog("info", `▶ ${d.label || d.step}`);
      } catch { /* ignore */ }
    });

    es.addEventListener("step:done", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as {
          step: string;
          ms: number;
          ok: boolean;
          summary?: string;
        };
        setStepStatus(d.step, {
          status: d.ok ? "done" : "warn",
          ms: d.ms,
          summary: d.summary,
        });
        if (d.summary) {
          setStepSummaries((prev) => {
            const next = new Map(prev);
            next.set(d.step, d.summary!);
            return next;
          });
        }
        appendLog(d.ok ? "info" : "warn", `${d.ok ? "✓" : "△"} ${d.step} (${d.ms}ms)${d.summary ? ` — ${d.summary}` : ""}`);
      } catch { /* ignore */ }
    });

    es.addEventListener("meta", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as RunMeta;
        setMeta((prev) => ({ ...prev, ...d }));
      } catch { /* ignore */ }
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const d = JSON.parse((e as MessageEvent).data ?? "{}") as { msg?: string };
        if (d.msg) {
          setError(d.msg);
          appendLog("error", d.msg);
          setRunning(false);
        }
      } catch { /* native connection error */ }
    });

    es.addEventListener("done", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as DoneEvent;
        setFinished(d);
        setProgress(100);
        setRunning(false);
        appendLog("info", `🏁 fertig · reportId: ${d.reportId} · gate: ${d.gate ?? "-"}`);
        // 1.2s delay then redirect
        setTimeout(() => {
          router.push(`/reports/${d.reportId}`);
        }, REDIRECT_DELAY_MS);
      } catch { /* ignore */ }
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId, appendLog, setStepStatus, router]);

  // Gate color
  const gateColor =
    finished?.gate === "Green"
      ? "text-accent-green"
      : finished?.gate === "Red"
      ? "text-red-400"
      : "text-amber-400";

  return (
    <main className="min-h-screen bg-secondary-950 text-secondary-100 flex flex-col">
      {/* ── Kopfzeile ───────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-secondary-800 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xl font-bold text-accent-cyan tracking-tight">
            {ticker}
          </span>
          <span className="text-secondary-500 text-sm hidden sm:block">
            {finished
              ? `Abgeschlossen · Gate: `
              : error
              ? "Fehlgeschlagen"
              : "Dossier wird erstellt…"}
            {finished?.gate && (
              <span className={`font-semibold ml-1 ${gateColor}`}>{finished.gate}</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm font-mono shrink-0">
          {/* Elapsed timer */}
          {!finished && !error && (
            <span className="text-secondary-500">
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
              {String(elapsed % 60).padStart(2, "0")}
            </span>
          )}
          {/* Progress % */}
          <span
            className={[
              "font-bold tabular-nums w-12 text-right",
              finished ? "text-accent-green" : "text-accent-cyan",
            ].join(" ")}
          >
            {progress}%
          </span>
        </div>
      </header>

      {/* ── Haupt-Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-600/50 bg-red-900/20 px-4 py-3 flex items-start gap-3"
          >
            <span className="text-red-400 text-lg leading-none mt-0.5">⚠</span>
            <div>
              <div className="text-red-300 font-semibold text-sm">Pipeline fehlgeschlagen</div>
              <div className="text-red-400 text-xs font-mono mt-1">{error}</div>
              <a
                href={`/run/${encodeURIComponent(ticker)}`}
                className="mt-2 inline-block text-xs text-red-300 underline hover:text-red-100"
              >
                Neuen Run starten →
              </a>
            </div>
          </div>
        )}

        {/* Redirect notice */}
        {finished && (
          <div
            role="status"
            aria-live="polite"
            className="mb-5 rounded-lg border border-accent-green/30 bg-accent-green/5 px-4 py-3 flex items-center gap-3"
          >
            <span className="text-accent-green text-lg leading-none">✓</span>
            <div>
              <div className="text-accent-green font-semibold text-sm">
                Analyse abgeschlossen — weiterleiten…
              </div>
              {finished.scoreTotal != null && (
                <div className="text-secondary-400 text-xs font-mono mt-0.5">
                  Score {finished.scoreTotal} · Gate {finished.gate}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2-Column grid: Stepper + Findings */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5 max-w-5xl mx-auto">
          {/* Stepper */}
          <div
            className="rounded-xl border border-secondary-800 bg-secondary-950 py-4"
            aria-label="Pipeline-Schritte"
          >
            <RunStepper
              stepStates={stepStates}
              latestLog={latestLog}
              prefersReducedMotion={prefersReducedMotion}
            />
          </div>

          {/* Findings panel */}
          <RunFindingsPanel
            meta={meta}
            stepSummaries={stepSummaries}
          />
        </div>
      </div>

      {/* ── Fußzeile ────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-secondary-800">
        {/* 3px secondary progress bar */}
        <div className="h-[3px] bg-secondary-900 overflow-hidden">
          <div
            className={[
              "h-full transition-all duration-500",
              finished
                ? "bg-accent-green"
                : error
                ? "bg-red-500"
                : "bg-accent-cyan",
            ].join(" ")}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Fortschritt: ${progress}%`}
          />
        </div>

        {/* Log toggle */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-xs text-secondary-500 hover:text-secondary-300 underline decoration-dotted"
          >
            {showLog ? "Technisches Log ausblenden" : "Technisches Log einblenden"}
          </button>
          <span className="text-[10px] font-mono text-secondary-700">
            runId: {runId || "—"}
          </span>
        </div>

        {/* Collapsible log panel */}
        {showLog && (
          <div className="border-t border-secondary-800 px-4 pb-4 pt-2">
            <LogPanel lines={logs} height={220} />
          </div>
        )}
      </footer>
    </main>
  );
}

