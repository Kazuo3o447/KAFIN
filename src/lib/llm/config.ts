/**
 * LLM-Provider-Konfiguration. Liest Provider-Einstellungen aus der Settings-Tabelle.
 * Unterstützt "lmstudio" (lokal), "deepseek" und "groq" (Cloud-API).
 */
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";

export type LLMProvider = "lmstudio" | "deepseek" | "groq";

export interface LLMConfig {
  provider: LLMProvider;
  deepseekApiKey: string;
  deepseekModel: string;
  groqApiKey: string;
  groqModel: string;
}

const DEFAULTS: LLMConfig = {
  provider: "lmstudio",
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  groqApiKey: "",
  groqModel: "meta-llama/llama-4-scout-17b-16e-instruct",
};

let cache: { ts: number; config: LLMConfig } | null = null;
const TTL_MS = 10_000;

function readKey(key: string): string | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    return typeof v === "string" ? v : null;
  } catch {
    return row.value;
  }
}

function normalizeProvider(value: string | null): LLMProvider {
  if (value === "deepseek" || value === "groq" || value === "lmstudio") return value;
  if (value === "ollama") return "lmstudio";
  return DEFAULTS.provider;
}

/** Liest LLM-Konfiguration aus der DB (10 s gecacht). */
export function getLLMConfig(): LLMConfig {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.config;
  const config: LLMConfig = {
    provider: normalizeProvider(readKey("llm_provider")),
    deepseekApiKey: readKey("deepseek_api_key") ?? DEFAULTS.deepseekApiKey,
    deepseekModel: readKey("deepseek_model") ?? DEFAULTS.deepseekModel,
    groqApiKey: readKey("groq_api_key") ?? DEFAULTS.groqApiKey,
    groqModel: readKey("groq_model") ?? DEFAULTS.groqModel,
  };
  cache = { ts: Date.now(), config };
  return config;
}

/** Cache leeren (nach Einstellungsänderung). */
export function invalidateLLMConfigCache(): void {
  cache = null;
}
