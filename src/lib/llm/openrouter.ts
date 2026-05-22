/**
 * OpenRouter-API-Client (OpenAI-kompatibel).
 * Spricht https://openrouter.ai/api/v1/chat/completions an.
 * Gleiche Schnittstelle wie chatJSON in ollama.ts.
 */
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { appendAudit } from "@/lib/storage/audit";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { parseRobustJSON } from "./repair";
import type { ChatJSONOptions, ChatJSONResult } from "./ollama";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 90_000;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number; metadata?: { raw?: string } };
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 524]);
const RETRY_BACKOFF_MS = [1200, 2500, 5000];
const RETRYABLE_NETWORK_RE = /terminated|fetch failed|network|timed out|socket|econnreset|enotfound|eai_again|aborted/i;
const RETRYABLE_PROVIDER_RE = /provider returned error|rate-limit|rate limit|temporarily|overloaded|unavailable|timeout/i;

function modelCandidates(primary: string): string[] {
  if (primary === "openrouter/free") return ["openrouter/free", "google/gemma-4-31b-it:free", "openrouter/auto"];
  if (primary === "google/gemma-4-31b-it:free") return ["google/gemma-4-31b-it:free", "openrouter/free", "openrouter/auto"];
  return [primary];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  apiKey: string,
): Promise<{ content: string; tokensIn?: number; tokensOut?: number }> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://kafin.local",
          "X-Title": "Kafin Research",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          // Instruiert das Modell, reines JSON zu liefern (OpenRouter-Proxy-Ebene)
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      lastErr = new Error(`OpenRouter network error: ${message}`);
      const canRetry = RETRYABLE_NETWORK_RE.test(message) && attempt < RETRY_BACKOFF_MS.length;
      if (canRetry) {
        await wait(RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      const text = await res.text();
      let detail = `OpenRouter API ${res.status}`;
      try {
        const err = JSON.parse(text) as { error?: { message?: string; metadata?: { raw?: string } } };
        const providerDetail = err.error?.metadata?.raw;
        detail = [err.error?.message, providerDetail].filter(Boolean).join(" - ") || detail;
      } catch {
        // ignore parse errors and keep default message
      }

      lastErr = new Error(detail);
      const canRetry = RETRYABLE_STATUS.has(res.status) && attempt < RETRY_BACKOFF_MS.length;
      if (canRetry) {
        await wait(RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }

    const json = (await res.json()) as OpenRouterResponse;
    if (json.error) {
      const detail = [json.error.message, json.error.metadata?.raw].filter(Boolean).join(" - ");
      lastErr = new Error(`OpenRouter: ${detail || "Provider returned error"}`);
      const canRetry = RETRYABLE_PROVIDER_RE.test(detail) && attempt < RETRY_BACKOFF_MS.length;
      if (canRetry) {
        await wait(RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      throw lastErr;
    }

    return {
      content: json.choices?.[0]?.message?.content ?? "",
      tokensIn: json.usage?.prompt_tokens,
      tokensOut: json.usage?.completion_tokens,
    };
  }

  throw lastErr ?? new Error("OpenRouter request failed");
}

export async function chatJSONOpenRouter<T = unknown>(
  opts: ChatJSONOptions,
  apiKey: string,
  model: string = "openrouter/free",
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
  let usedModel = model;

  async function callWithFallback(
    requestMessages: Array<{ role: string; content: string }>,
  ): Promise<{ content: string; tokensIn?: number; tokensOut?: number }> {
    const candidates = modelCandidates(model);
    let lastErr: Error | null = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i]!;
      try {
        const out = await callOpenRouter(requestMessages, candidate, temperature, apiKey);
        usedModel = candidate;
        return out;
      } catch (e) {
        lastErr = e as Error;
        const msg = lastErr.message || "";
        const retryWithNextModel =
          i < candidates.length - 1 &&
          (/model not found/i.test(msg) || RETRYABLE_PROVIDER_RE.test(msg) || RETRYABLE_NETWORK_RE.test(msg));
        if (!retryWithNextModel) throw lastErr;
      }
    }

    throw lastErr ?? new Error("OpenRouter request failed");
  }

  try {
    const first = await callWithFallback(messages);
    raw = first.content;
    tokensIn = first.tokensIn;
    tokensOut = first.tokensOut;
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
      const repair = await callWithFallback(repairMessages);
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
      model: usedModel,
      temperature,
      promptHash,
      promptPath,
      responsePath,
      tokensIn,
      tokensOut,
      ms,
      ok,
      error: errMsg,
    });
  }

  return { data: parsed as T, raw, ms: Date.now() - t0, promptHash };
}
