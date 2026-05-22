/**
 * LLM-Provider-Konfiguration. Liest Provider-Einstellungen aus der Settings-Tabelle.
 * Unterstützt "ollama" (lokal), "deepseek" und "openrouter" (Cloud-API).
 */
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";

export type LLMProvider = "ollama" | "deepseek" | "openrouter";

export interface LLMConfig {
  provider: LLMProvider;
  deepseekApiKey: string;
  deepseekModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
}

const DEFAULTS: LLMConfig = {
  provider: "ollama",
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  openrouterApiKey: "",
  openrouterModel: "openrouter/free",
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

/** Liest LLM-Konfiguration aus der DB (10 s gecacht). */
export function getLLMConfig(): LLMConfig {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.config;
  const config: LLMConfig = {
    provider: (readKey("llm_provider") as LLMProvider | null) ?? DEFAULTS.provider,
    deepseekApiKey: readKey("deepseek_api_key") ?? DEFAULTS.deepseekApiKey,
    deepseekModel: readKey("deepseek_model") ?? DEFAULTS.deepseekModel,
    openrouterApiKey: readKey("openrouter_api_key") ?? DEFAULTS.openrouterApiKey,
    openrouterModel: readKey("openrouter_model") ?? DEFAULTS.openrouterModel,
  };
  cache = { ts: Date.now(), config };
  return config;
}

/** Cache leeren (nach Einstellungsänderung). */
export function invalidateLLMConfigCache(): void {
  cache = null;
}
