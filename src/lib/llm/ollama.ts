/**
 * LM-Studio-Client. Spricht den lokalen OpenAI-kompatiblen Server an.
 * - listModels(): GET /v1/models
 * - chatJSON():   POST /v1/chat/completions, schreibt Audit-Eintrag
 *
 * Siehe docs/AGENT.md §2 + §6.
 */
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { appendAudit } from "@/lib/storage/audit";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { parseRobustJSON } from "./repair";
import { getLLMConfig } from "./config";
import { chatJSONDeepSeek } from "./deepseek";
import { chatJSONGroq } from "./groq";

const baseUrl = (
  process.env.LLM_BASE_URL ||
  process.env.LM_STUDIO_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  "http://localhost:1234"
).replace(/\/$/, "");

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
  const res = await fetch(`${baseUrl}/v1/models`, { cache: "no-store" });
  if (!res.ok) throw new Error(`LM Studio /v1/models HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id?: string; created?: number; object?: string; owned_by?: string }> };
  const data = (json.data ?? []).map((model) => ({
    name: model.id ?? "unknown",
    size: 0,
    modified_at: model.created ? new Date(model.created * 1000).toISOString() : new Date().toISOString(),
    details: { family: model.owned_by ?? model.object ?? "local" },
  }));
  modelsCache = { ts: Date.now(), data };
  return data;
}

export async function pickDefaultModel(preferred?: string): Promise<string> {
  const models = await listModels();
  if (models.length === 0) throw new Error("Kein LM-Studio-Modell verfügbar. Bitte ein lokales Modell laden.");
  if (preferred && models.some((m) => m.name === preferred)) return preferred;
  const textModels = models.filter(isLikelyTextModel);
  if (textModels.length === 0) {
    throw new Error(
      "Kein geeignetes Text-LLM in LM Studio gefunden. Vision- und Embedding-Modelle werden fuer JSON-Research nicht automatisch ausgewaehlt.",
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
  model: string;
  effectiveModel: string;
  provider: "ollama" | "deepseek" | "groq" | "openrouter" | "lmstudio";
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
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
}

/**
 * Führt einen JSON-formatierten LLM-Chat aus — routet zu LM Studio oder DeepSeek
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
  if (llmConfig.provider === "groq") {
    if (!llmConfig.groqApiKey) throw new Error("Groq API-Key nicht konfiguriert (Einstellungen → LLM Provider).");
    return chatJSONGroq<T>(opts, llmConfig.groqApiKey, llmConfig.groqModel);
  }

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

  const t0 = Date.now();
  let raw = "";
  let parsed: T | undefined;
  let ok = false;
  let errMsg: string | undefined;
  let effectiveModel = opts.model;

  async function callLocal(reqMessages: Array<{ role: string; content: string }>): Promise<string> {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: reqMessages,
        temperature: opts.temperature ?? 0.2,
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: opts.signal ?? AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LM Studio API ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    if (json.model) effectiveModel = json.model;
    return json.choices?.[0]?.message?.content ?? "";
  }

  try {
    raw = await callLocal(messages);
    if (responsePath) atomicWrite(responsePath, raw);
    try {
      parsed = parseRobustJSON<T>(raw);
      ok = true;
    } catch {
      // Repair-Retry mit explizitem Hinweis
      const repairMessages: Array<{ role: string; content: string }> = [
        ...messages,
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            "Deine letzte Antwort war kein gültiges JSON. Liefere ausschließlich ein einziges JSON-Objekt, ohne Markdown, ohne Kommentare.",
        },
      ];
      raw = await callLocal(repairMessages);
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
        provider: "lmstudio",
      requestedModel: opts.model,
      model: effectiveModel,
      temperature: opts.temperature ?? 0.2,
      promptHash,
      promptPath,
      responsePath,
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
    model: opts.model,
    effectiveModel,
    provider: "lmstudio",
  };
}
