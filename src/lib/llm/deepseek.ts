/**
 * DeepSeek-API-Client (OpenAI-kompatibel).
 * Spricht https://api.deepseek.com/chat/completions an.
 * Gleiche Schnittstelle wie chatJSON in ollama.ts.
 */
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { appendAudit } from "@/lib/storage/audit";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { parseRobustJSON } from "./repair";
import type { ChatJSONOptions, ChatJSONResult } from "./ollama";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callDeepSeek(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  apiKey: string,
): Promise<{ content: string; tokensIn?: number; tokensOut?: number }> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
    // kein Timeout — DeepSeek antwortet schnell, aber komplexe Prompts können dauern
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as DeepSeekResponse;
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    tokensIn: json.usage?.prompt_tokens,
    tokensOut: json.usage?.completion_tokens,
  };
}

export async function chatJSONDeepSeek<T = unknown>(
  opts: ChatJSONOptions,
  apiKey: string,
  model: string = "deepseek-chat",
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

  try {
    const first = await callDeepSeek(messages, model, temperature, apiKey);
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
      const repair = await callDeepSeek(repairMessages, model, temperature, apiKey);
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
      model,
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
