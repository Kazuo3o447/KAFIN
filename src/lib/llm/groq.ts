/**
 * Groq-API-Client (OpenAI-kompatibel).
 * Spricht https://api.groq.com/openai/v1/chat/completions an.
 * Gleiche Schnittstelle wie chatJSON in ollama.ts.
 */
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { appendAudit } from "@/lib/storage/audit";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { parseRobustJSON } from "./repair";
import type { ChatJSONOptions, ChatJSONResult } from "./ollama";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const REQUEST_TIMEOUT_MS = 60_000;

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
  model?: string;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_BACKOFF_MS = [2000, 5000, 15000];
const MAX_RETRY_AFTER_MS = 90_000;
const RETRYABLE_RE = /rate.?limit|overloaded|temporarily|timeout|network|fetch failed|terminated|socket|econnreset|enotfound/i;

/** Liest Retry-After (Sekunden oder HTTP-Datum) und gibt Wartezeit in ms zurück. */
function parseRetryAfter(headers: Headers, bodyText?: string): number | null {
  const header = headers.get("retry-after") ?? headers.get("x-ratelimit-reset-tokens");
  if (header) {
    const secs = parseFloat(header);
    if (!isNaN(secs)) return Math.min(Math.ceil(secs * 1000), MAX_RETRY_AFTER_MS);
    const date = Date.parse(header);
    if (!isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  // Fallback: "try again in X.Xs" aus dem Fehlertext
  if (bodyText) {
    const m = /try again in ([\d.]+)s/i.exec(bodyText);
    if (m) return Math.min(Math.ceil(parseFloat(m[1]!) * 1000), MAX_RETRY_AFTER_MS);
  }
  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  apiKey: string,
): Promise<{
  content: string;
  tokensIn?: number;
  tokensOut?: number;
  effectiveModel?: string;
  systemFingerprint?: string | null;
  rateLimit?: {
    limitRequests?: string | null;
    limitTokens?: string | null;
    remainingRequests?: string | null;
    remainingTokens?: string | null;
    resetRequests?: string | null;
    resetTokens?: string | null;
    retryAfter?: string | null;
  };
}> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          // response_format nicht gesetzt – reasoning-Modelle (z.B. openai/gpt-oss-120b)
          // liefern 400 mit json_object; Prompts erzwingen JSON explizit.
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      lastErr = new Error(`Groq network error: ${message}`);
      const canRetry = RETRYABLE_RE.test(message) && attempt < RETRY_BACKOFF_MS.length;
      if (canRetry) {
        await wait(RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      const text = await res.text();
      let detail = `Groq API ${res.status}`;
      try {
        const err = JSON.parse(text) as { error?: { message?: string } };
        detail = err.error?.message ?? detail;
      } catch {
        // ignore parse errors
      }
      lastErr = new Error(detail);
      const canRetry = RETRYABLE_STATUS.has(res.status) && attempt < RETRY_BACKOFF_MS.length;
      if (canRetry) {
        const retryAfterMs = res.status === 429 ? parseRetryAfter(res.headers, text) : null;
        await wait(retryAfterMs ?? RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }

    const json = (await res.json()) as GroqResponse;
    if (json.error) {
      lastErr = new Error(`Groq: ${json.error.message ?? "API error"}`);
      const canRetry = RETRYABLE_RE.test(json.error.message ?? "") && attempt < RETRY_BACKOFF_MS.length;
      if (canRetry) {
        await wait(RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }

    return {
      content: json.choices?.[0]?.message?.content ?? "",
      tokensIn: json.usage?.prompt_tokens,
      // completion_tokens schließt reasoning_tokens ein – relevanter für Billing
      tokensOut: json.usage?.completion_tokens,
      effectiveModel: json.model ?? model,
      systemFingerprint: (json as { system_fingerprint?: string }).system_fingerprint ?? null,
      rateLimit: {
        limitRequests: res.headers.get("x-ratelimit-limit-requests"),
        limitTokens: res.headers.get("x-ratelimit-limit-tokens"),
        remainingRequests: res.headers.get("x-ratelimit-remaining-requests"),
        remainingTokens: res.headers.get("x-ratelimit-remaining-tokens"),
        resetRequests: res.headers.get("x-ratelimit-reset-requests"),
        resetTokens: res.headers.get("x-ratelimit-reset-tokens"),
        retryAfter: res.headers.get("retry-after"),
      },
    };
  }

  throw lastErr ?? new Error("Groq request failed");
}

export async function chatJSONGroq<T = unknown>(
  opts: ChatJSONOptions,
  apiKey: string,
  model: string = "meta-llama/llama-4-scout-17b-16e-instruct",
): Promise<ChatJSONResult<T>> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const promptText = JSON.stringify(messages);
  const promptHash = "sha256:" + crypto.createHash("sha256").update(promptText).digest("hex");

  let promptPath: string | undefined;
  let responsePath: string | undefined;
  if (opts.artifactsDir) {
    promptPath = path.join(opts.artifactsDir, "prompts", `${opts.step}.json`);
    responsePath = path.join(opts.artifactsDir, "responses", `${opts.step}.json`);
    fs.mkdirSync(path.dirname(promptPath), { recursive: true });
    fs.mkdirSync(path.dirname(responsePath), { recursive: true });
    atomicWrite(promptPath, promptText);
  }

  const temperature = opts.temperature ?? 0.2;
  const t0 = Date.now();
  let raw = "";
  let parsed: T | undefined;
  let ok = false;
  let errMsg: string | undefined;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let effectiveModel = model;
  let systemFingerprint: string | null = null;
  let rateLimit:
    | {
        limitRequests?: string | null;
        limitTokens?: string | null;
        remainingRequests?: string | null;
        remainingTokens?: string | null;
        resetRequests?: string | null;
        resetTokens?: string | null;
        retryAfter?: string | null;
      }
    | undefined;

  try {
    const first = await callGroq(messages, model, temperature, apiKey);
    raw = first.content;
    tokensIn = first.tokensIn;
    tokensOut = first.tokensOut;
    effectiveModel = first.effectiveModel ?? model;
    systemFingerprint = first.systemFingerprint ?? null;
    rateLimit = first.rateLimit;
    if (responsePath) atomicWrite(responsePath, raw);

    try {
      parsed = parseRobustJSON<T>(raw);
      ok = true;
    } catch {
      // Repair-Retry
      const repairMessages = [
        ...messages,
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            "Deine letzte Antwort war kein gültiges JSON. Liefere ausschließlich ein einziges JSON-Objekt, ohne Markdown, ohne Kommentare.",
        },
      ];
      const repair = await callGroq(repairMessages, model, temperature, apiKey);
      raw = repair.content;
      if (responsePath) atomicWrite(responsePath, raw);
      parsed = parseRobustJSON<T>(raw);
      ok = true;
    }
  } catch (e) {
    errMsg = (e as Error).message;
    throw e;
  } finally {
    const ms = Date.now() - t0;
    appendAudit({
      runId: opts.runId,
      step: opts.step,
      provider: "groq",
      requestedModel: model,
      model: effectiveModel,
      temperature,
      promptHash,
      promptPath,
      responsePath,
      tokensIn,
      tokensOut,
      rateLimit,
      systemFingerprint,
      ms,
      ok,
      error: errMsg,
    });
  }

  return {
    data: parsed as T,
    raw,
    ms: Date.now() - t0,
    promptHash,
    model,
    effectiveModel,
    provider: "groq",
    usage: {
      promptTokens: tokensIn,
      completionTokens: tokensOut,
      totalTokens: (tokensIn ?? 0) + (tokensOut ?? 0),
    },
    rateLimit,
    systemFingerprint,
  };
}
