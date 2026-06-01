/**
 * Append-only Audit-Log (JSONL). Jeder LLM-Call und jeder Datenabruf.
 * Siehe docs/AGENT.md §6.
 */
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.env.DATA_DIR || "./data", "logs");
const AUDIT_PATH = path.join(LOG_DIR, "audit.jsonl");

fs.mkdirSync(LOG_DIR, { recursive: true });

export interface AuditEvent {
  ts: number;
  runId: string;
  step: string;
  provider?: string;
  requestedModel?: string;
  model?: string;
  temperature?: number;
  promptHash?: string;
  promptPath?: string;
  responsePath?: string;
  tokensIn?: number;
  tokensOut?: number;
  rateLimit?: {
    limitRequests?: string | null;
    limitTokens?: string | null;
    remainingRequests?: string | null;
    remainingTokens?: string | null;
    resetRequests?: string | null;
    resetTokens?: string | null;
    retryAfter?: string | null;
  };
  systemFingerprint?: string | null;
  ms?: number;
  ok: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export function appendAudit(event: Omit<AuditEvent, "ts"> & { ts?: number }): void {
  const line =
    JSON.stringify({ ts: event.ts ?? Date.now(), ...event }) + "\n";
  fs.appendFileSync(AUDIT_PATH, line, "utf8");
}
