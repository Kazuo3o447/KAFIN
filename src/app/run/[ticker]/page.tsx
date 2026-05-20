"use client";
/**
 * Run-Page — verbindet sich mit /api/runs/[id]/stream (SSE) und zeigt Live-Log + Progress.
 * Bei `done` redirect zum Audit-Dashboard.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/GlassCard";
import { LogPanel, type LogLine } from "@/components/LogPanel";

interface DoneEvent {
  reportId: string;
  gate?: string;
  scoreTotal?: number;
}

export default function RunPage() {
  const params = useParams<{ ticker: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const ticker = decodeURIComponent(params.ticker ?? "");
  const runId = search.get("runId") ?? "";

  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string>("");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<DoneEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function appendLog(level: LogLine["level"], message: string) {
    setLogs((prev) => [...prev, { ts: Date.now(), level, message }].slice(-1000));
  }

  useEffect(() => {
    if (!runId) {
      setError("Keine runId in URL.");
      return;
    }
    const es = new EventSource(`/api/runs/${runId}/stream`);
    esRef.current = es;

    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { level: LogLine["level"]; msg: string };
        appendLog(d.level ?? "info", d.msg);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { pct: number };
        setProgress(d.pct);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("step:start", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { label: string; step: string };
        setStep(d.label || d.step);
        appendLog("info", `▶ ${d.label || d.step}`);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("step:done", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { step: string; ms: number; ok: boolean };
        appendLog(d.ok ? "info" : "warn", `✓ ${d.step} (${d.ms}ms)`);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const d = JSON.parse((e as MessageEvent).data ?? "{}") as { msg?: string };
        if (d.msg) {
          setError(d.msg);
          appendLog("error", d.msg);
        }
      } catch {
        /* native error event */
      }
    });
    es.addEventListener("done", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as DoneEvent;
        setFinished(d);
        setProgress(100);
        appendLog("info", `🏁 fertig: report ${d.reportId}`);
      } catch {
        /* ignore */
      }
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono text-accent-400">{ticker}</span> · Research-Run
          </h1>
          <p className="text-sm text-secondary-500 mt-1">runId: <code className="font-mono text-xs">{runId || "—"}</code></p>
        </div>
        {finished ? (
          <button
            onClick={() => router.push(`/reports/${finished.reportId}`)}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-md text-sm font-medium text-white"
          >
            Zum Audit-Dashboard →
          </button>
        ) : null}
      </header>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-secondary-300">{step || "warte auf Start…"}</span>
          <span className="text-sm font-mono text-accent-400">{progress}%</span>
        </div>
        <div className="h-2 bg-secondary-800 rounded overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        {error ? <div className="mt-3 text-sm text-red-400">⚠ {error}</div> : null}
      </GlassCard>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-2">Live-Log</h2>
        <LogPanel lines={logs} height={420} />
      </section>
    </main>
  );
}
