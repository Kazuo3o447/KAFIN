/**
 * Logs – zeigt persistierte Run-Logs (runs.jsonl) und LLM-Audit (audit.jsonl).
 */
import fs from "node:fs";
import path from "node:path";
import { GlassCard } from "@/components/GlassCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG_DIR = path.join(process.cwd(), "data", "logs");

interface RunLogEntry {
  ts: string;
  level: "info" | "warn" | "error" | "debug";
  msg: string;
  runId: string;
}

interface AuditEntry {
  ts: number;
  runId: string;
  step: string;
  model?: string;
  ms?: number;
  ok: boolean;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
}

function readJsonl<T>(file: string, tail: number): T[] {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  return lines
    .slice(-tail)
    .map((l) => {
      try { return JSON.parse(l) as T; } catch { return null; }
    })
    .filter(Boolean) as T[];
}

function fmtTs(ts: string | number): string {
  try {
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
    return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium" });
  } catch { return String(ts); }
}

function levelColor(level: string): string {
  if (level === "error") return "text-red-400";
  if (level === "warn") return "text-yellow-400";
  if (level === "debug") return "text-secondary-500";
  return "text-sky-400";
}

export default function LogsPage() {
  const runLogs = readJsonl<RunLogEntry>(path.join(LOG_DIR, "runs.jsonl"), 300).reverse();
  const auditLogs = readJsonl<AuditEntry>(path.join(LOG_DIR, "audit.jsonl"), 100).reverse();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-secondary-400 mt-1">
          Run-Nachrichten + LLM-Audit. Seite neu laden für aktuellen Stand.
        </p>
      </header>

      {/* ── Run-Logs ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-2">
          Pipeline-Logs
          <span className="ml-2 text-secondary-600 normal-case font-normal">(runs.jsonl · letzte 300)</span>
        </h2>
        <GlassCard className="p-0 overflow-hidden">
          {runLogs.length === 0 ? (
            <div className="p-5 text-sm text-secondary-500">— noch keine Einträge —</div>
          ) : (
            <div className="log-panel max-h-[40vh] rounded-[14px]">
              {runLogs.map((e, i) => (
                <div key={i} className="log-line">
                  <span className="log-ts">{fmtTs(e.ts)}</span>{" "}
                  <span className={`font-mono text-xs ${levelColor(e.level)}`}>[{e.level}]</span>{" "}
                  <span className="font-mono text-[10px] text-secondary-600">{e.runId.slice(0, 8)}</span>{" "}
                  <span>{e.msg}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </section>

      {/* ── LLM-Audit ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm uppercase tracking-wide text-secondary-500 mb-2">
          LLM-Audit
          <span className="ml-2 text-secondary-600 normal-case font-normal">(audit.jsonl · letzte 100 Calls)</span>
        </h2>
        <GlassCard className="p-0 overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="p-5 text-sm text-secondary-500">— noch keine LLM-Calls —</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-secondary-800 text-secondary-500 uppercase text-[10px] tracking-wide">
                    <th className="text-left px-4 py-2">Zeit</th>
                    <th className="text-left px-4 py-2">Run</th>
                    <th className="text-left px-4 py-2">Step</th>
                    <th className="text-left px-4 py-2">Modell</th>
                    <th className="text-right px-4 py-2">ms</th>
                    <th className="text-center px-4 py-2">OK</th>
                    <th className="text-left px-4 py-2">Fehler</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((e, i) => (
                    <tr key={i} className="border-b border-secondary-900 hover:bg-secondary-900/40">
                      <td className="px-4 py-1.5 text-secondary-500 whitespace-nowrap">{fmtTs(e.ts)}</td>
                      <td className="px-4 py-1.5 text-secondary-600">{e.runId.slice(0, 8)}</td>
                      <td className="px-4 py-1.5 text-sky-300">{e.step}</td>
                      <td className="px-4 py-1.5 text-secondary-300">{e.model ?? "—"}</td>
                      <td className="px-4 py-1.5 text-right text-secondary-400">
                        {e.ms != null ? (e.ms / 1000).toFixed(1) + " s" : "—"}
                      </td>
                      <td className="px-4 py-1.5 text-center">
                        {e.ok ? (
                          <span className="text-green-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-red-400 max-w-xs truncate">
                        {e.error ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </section>
    </main>
  );
}

