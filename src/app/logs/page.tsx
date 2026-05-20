/**
 * Logs – Tail von data/logs/audit.jsonl (server side).
 */
import fs from "node:fs";
import path from "node:path";
import { GlassCard } from "@/components/GlassCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AuditEntry {
  ts: string;
  level?: string;
  msg?: string;
  [k: string]: unknown;
}

function readTail(file: string, lines: number): AuditEntry[] {
  if (!fs.existsSync(file)) return [];
  const buf = fs.readFileSync(file, "utf8");
  const all = buf.split("\n").filter((l) => l.trim().length > 0);
  return all
    .slice(-lines)
    .map((l) => {
      try {
        return JSON.parse(l) as AuditEntry;
      } catch {
        return { ts: "", msg: l };
      }
    })
    .reverse();
}

export default function LogsPage() {
  const file = path.join(process.cwd(), "data", "logs", "audit.jsonl");
  const tail = readTail(file, 200);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Audit-Logs</h1>
        <p className="text-sm text-secondary-400 mt-1">
          Letzte 200 Zeilen aus <code className="font-mono">data/logs/audit.jsonl</code>.
        </p>
      </header>

      <GlassCard className="p-0">
        {tail.length === 0 ? (
          <div className="p-6 text-sm text-secondary-500">— keine Audit-Einträge —</div>
        ) : (
          <pre className="log-panel max-h-[70vh] m-0 rounded-[14px]">
            {tail
              .map((e) =>
                JSON.stringify({
                  ts: e.ts,
                  level: e.level,
                  msg: e.msg,
                  ...Object.fromEntries(
                    Object.entries(e).filter(([k]) => !["ts", "level", "msg"].includes(k)),
                  ),
                }),
              )
              .join("\n")}
          </pre>
        )}
      </GlassCard>
    </main>
  );
}
