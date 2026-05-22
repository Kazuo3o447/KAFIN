/**
 * Run-Event-Bus für Live-Logs und SSE.
 * Pro `runId` wird ein EventEmitter gehalten; SSE-Routes abonnieren.
 *
 * Event-Schema (siehe ARCHITECTURE.md §5):
 *  - `log`        { ts, level, msg }
 *  - `progress`   { pct }
 *  - `step:start` { step, label }
 *  - `step:done`  { step, ms, ok }
 *  - `error`      { msg }
 *  - `done`       { reportId, gate, scoreTotal }
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.env.DATA_DIR || "./data", "logs");
const RUN_LOG_PATH = path.join(LOG_DIR, "runs.jsonl");
fs.mkdirSync(LOG_DIR, { recursive: true });

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEvent {
  ts: string; // ISO
  level: LogLevel;
  msg: string;
}
export interface ProgressEvent {
  pct: number;
}
export interface StepStartEvent {
  step: string;
  label: string;
}
export interface StepDoneEvent {
  step: string;
  ms: number;
  ok: boolean;
}
export interface ErrorEvent {
  msg: string;
}
export interface DoneEvent {
  reportId: string;
  gate: "Green" | "Yellow" | "Red";
  scoreTotal: number;
}

export type RunEventName =
  | "log"
  | "progress"
  | "step:start"
  | "step:done"
  | "error"
  | "done";

interface BusEntry {
  emitter: EventEmitter;
  /** Letzten N Events buffern, damit spät verbundene SSE-Clients nichts verpassen */
  buffer: Array<{ name: RunEventName; data: unknown }>;
  done: boolean;
}

// An globalThis hängen, damit in Next.js-Dev-Mode alle Route-Module
// (die jeweils eigene module-Instanzen bekommen können) denselben Bus teilen.
type GlobalBus = Map<string, BusEntry>;
declare global {
  // eslint-disable-next-line no-var
  var __kafinRunBus: GlobalBus | undefined;
}
if (!globalThis.__kafinRunBus) globalThis.__kafinRunBus = new Map<string, BusEntry>();
const bus: GlobalBus = globalThis.__kafinRunBus;
const BUFFER_LIMIT = 500;

export function ensureRunBus(runId: string): BusEntry {
  let e = bus.get(runId);
  if (!e) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);
    e = { emitter, buffer: [], done: false };
    bus.set(runId, e);
  }
  return e;
}

export function emitRun(runId: string, name: RunEventName, data: unknown): void {
  const entry = ensureRunBus(runId);
  if (entry.buffer.length >= BUFFER_LIMIT) entry.buffer.shift();
  entry.buffer.push({ name, data });
  entry.emitter.emit(name, data);
  if (name === "done" || name === "error") {
    entry.done = true;
    // Nach 5 Minuten aufräumen
    setTimeout(() => bus.delete(runId), 5 * 60_000);
  }
}

export function getBuffer(runId: string): Array<{ name: RunEventName; data: unknown }> {
  return bus.get(runId)?.buffer ?? [];
}

export function isDone(runId: string): boolean {
  return bus.get(runId)?.done ?? false;
}

export function logRun(runId: string, level: LogLevel, msg: string): void {
  const ts = new Date().toISOString();
  // In Datei persistieren, damit Logs nach dem Run nachlesbar bleiben
  try {
    fs.appendFileSync(RUN_LOG_PATH, JSON.stringify({ ts, level, msg, runId }) + "\n", "utf8");
  } catch {
    /* Disk-Fehler sollen den Run nicht abbrechen */
  }
  emitRun(runId, "log", { ts, level, msg } satisfies LogEvent);
}

export function makeRunLogger(runId: string): (msg: string) => void {
  return (msg: string) => logRun(runId, "info", msg);
}
