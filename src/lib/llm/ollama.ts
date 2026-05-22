/**
 * Ollama-Client. Spricht Host-Ollama via HTTP an (OLLAMA_BASE_URL).
 * - listModels(): GET /api/tags
 * - chatJSON():   POST /api/chat (format=json), schreibt Audit-Eintrag
 *
 * Siehe docs/AGENT.md §2 + §6.
 */
import { Ollama, type ChatRequest, type Message } from "ollama";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { appendAudit } from "@/lib/storage/audit";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { parseRobustJSON } from "./repair";
import { getLLMConfig } from "./config";
import { chatJSONDeepSeek } from "./deepseek";

const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
export const ollama = new Ollama({ host: baseUrl });

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: {
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

let modelsCache: { ts: number; data: OllamaModel[] } | null = null;
const MODELS_TTL_MS = 30_000;

export async function listModels(force = false): Promise<OllamaModel[]> {
  if (!force && modelsCache && Date.now() - modelsCache.ts < MODELS_TTL_MS) {
    return modelsCache.data;
  }
  const res = await fetch(`${baseUrl}/api/tags`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Ollama /api/tags HTTP ${res.status}`);
  const json = (await res.json()) as { models?: OllamaModel[] };
  const data = json.models ?? [];
  modelsCache = { ts: Date.now(), data };
  return data;
}

export async function pickDefaultModel(preferred?: string): Promise<string> {
  const models = await listModels();
  if (models.length === 0) throw new Error("Kein Ollama-Modell installiert. `ollama pull <model>` ausführen.");
  if (preferred && models.some((m) => m.name === preferred)) return preferred;
  const textModels = models.filter(isLikelyTextModel);
  if (textModels.length === 0) {
    throw new Error(
      "Kein geeignetes Text-LLM in Ollama gefunden. Vision- und Embedding-Modelle werden fuer JSON-Research nicht automatisch ausgewaehlt.",
    );
  }
  return textModels[0]!.name;
}

function isLikelyTextModel(model: OllamaModel): boolean {
  const haystack = [model.name, model.details?.family, ...(model.details?.families ?? [])]
    .join(" ")
    .toLowerCase();
  return !/\b(embed|embedding|clip|vision|llava|bakllava|moondream|minicpm-v|nomic-embed)\b/.test(haystack);
}

export interface ChatJSONOptions {
  runId: string;
  step: string;
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
  /** Verzeichnis für Prompt-/Response-Snapshots (raw/{TICKER}/{runId}/) */
  artifactsDir?: string;
}

export interface ChatJSONResult<T = unknown> {
  data: T;
  raw: string;
  ms: number;
  promptHash: string;
}

/**
 * Führt einen JSON-formatierten LLM-Chat aus — routet zu Ollama oder DeepSeek
 * je nach aktueller Provider-Einstellung. Persistiert Prompt + Response,
 * schreibt einen Audit-Eintrag und liefert geparste Daten zurück.
 * Bei JSON-Parse-Fehler: 1× Repair-Retry, dann throw.
 */
export async function chatJSON<T = unknown>(opts: ChatJSONOptions): Promise<ChatJSONResult<T>> {
  const llmConfig = getLLMConfig();
  if (llmConfig.provider === "deepseek") {
    if (!llmConfig.deepseekApiKey) throw new Error("DeepSeek API-Key nicht konfiguriert (Einstellungen → LLM Provider).");
    return chatJSONDeepSeek<T>(opts, llmConfig.deepseekApiKey, llmConfig.deepseekModel);
  }

  const messages: Message[] = [];
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

  const baseReq: ChatRequest = {
    model: opts.model,
    messages,
    format: "json",
    options: { temperature: opts.temperature ?? 0.2 },
    keep_alive: "10m",
  };

  const t0 = Date.now();
  let raw = "";
  let parsed: T | undefined;
  let ok = false;
  let errMsg: string | undefined;

  /** Stream-Chat: sammelt alle Tokens auf (umgeht den undici headersTimeout). */
  async function streamChat(req: ChatRequest): Promise<string> {
    const iter = await ollama.chat({ ...req, stream: true });
    let buf = "";
    for await (const chunk of iter) {
      buf += chunk.message?.content ?? "";
    }
    return buf;
  }

  try {
    raw = await streamChat(baseReq);
    if (responsePath) atomicWrite(responsePath, raw);
    try {
      parsed = parseRobustJSON<T>(raw);
      ok = true;
    } catch {
      // Repair-Retry mit explizitem Hinweis
      const repairMessages: Message[] = [
        ...messages,
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            "Deine letzte Antwort war kein gültiges JSON. Liefere ausschließlich ein einziges JSON-Objekt, ohne Markdown, ohne Kommentare.",
        },
      ];
      raw = await streamChat({ ...baseReq, messages: repairMessages });
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
      model: opts.model,
      temperature: opts.temperature ?? 0.2,
      promptHash,
      promptPath,
      responsePath,
      ms,
      ok,
      error: errMsg,
    });
  }

  return { data: parsed as T, raw, ms: Date.now() - t0, promptHash };
}
