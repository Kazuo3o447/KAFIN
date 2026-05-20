"use client";
/**
 * LogPanel – monospaced Log-Feed mit Tail-Following.
 */
import { useEffect, useRef } from "react";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogLine {
  ts: number; // unix ms
  level: LogLevel;
  message: string;
}

interface Props {
  lines: LogLine[];
  follow?: boolean;
  height?: number;
}

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("de-DE", { hour12: false });
}

export function LogPanel({ lines, follow = true, height = 360 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!follow || !ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, follow]);

  return (
    <div className="log-panel" style={{ maxHeight: height }} ref={ref}>
      {lines.length === 0 ? (
        <div className="text-secondary-600">— noch keine Log-Einträge —</div>
      ) : (
        lines.map((l, i) => (
          <div key={i} className="log-line">
            <span className="log-ts">{formatTs(l.ts)}</span>{" "}
            <span className={`log-level-${l.level}`}>[{l.level}]</span>{" "}
            <span>{l.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
