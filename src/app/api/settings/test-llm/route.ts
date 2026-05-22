/**
 * GET /api/settings/test-llm
 * Testet den aktuell konfigurierten LLM-Provider und liefert {ok, message}.
 * Ollama: prüft ob der Dienst erreichbar ist und Modelle vorhanden sind.
 * DeepSeek: macht einen minimalen API-Call (1 Token) zur Key-Validierung.
 */
import { NextResponse } from "next/server";
import { getLLMConfig } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const cfg = getLLMConfig();

  if (cfg.provider === "deepseek") {
    if (!cfg.deepseekApiKey) {
      return NextResponse.json({ ok: false, message: "Kein API-Key konfiguriert." });
    }
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: cfg.deepseekModel || "deepseek-chat",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { model?: string };
        return NextResponse.json({
          ok: true,
          message: `Verbunden · Modell: ${json.model ?? cfg.deepseekModel}`,
        });
      }
      const body = await res.text();
      let detail = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(body) as { error?: { message?: string } };
        detail = err.error?.message ?? detail;
      } catch { /* ignore */ }
      return NextResponse.json({ ok: false, message: detail });
    } catch (e) {
      return NextResponse.json({ ok: false, message: (e as Error).message });
    }
  }

  if (cfg.provider === "openrouter") {
    if (!cfg.openrouterApiKey) {
      return NextResponse.json({ ok: false, message: "Kein OpenRouter API-Key konfiguriert." });
    }
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.openrouterApiKey}`,
          "HTTP-Referer": "https://kafin.local",
          "X-Title": "Kafin Research",
        },
        body: JSON.stringify({
          model: cfg.openrouterModel || "openrouter/free",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { model?: string };
        return NextResponse.json({
          ok: true,
          message: `OpenRouter verbunden · Modell: ${json.model ?? cfg.openrouterModel}`,
        });
      }
      const bodyText = await res.text();
      let detail = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(bodyText) as { error?: { message?: string } };
        detail = err.error?.message ?? detail;
      } catch { /* ignore */ }
      return NextResponse.json({ ok: false, message: detail });
    } catch (e) {
      return NextResponse.json({ ok: false, message: (e as Error).message });
    }
  }

  // Ollama
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: `Ollama HTTP ${res.status}` });
    }
    const json = (await res.json()) as { models?: unknown[] };
    const count = json.models?.length ?? 0;
    if (count === 0) {
      return NextResponse.json({ ok: false, message: "Ollama erreichbar, aber keine Modelle installiert." });
    }
    return NextResponse.json({ ok: true, message: `Ollama erreichbar · ${count} Modell(e)` });
  } catch (e) {
    return NextResponse.json({ ok: false, message: `Ollama nicht erreichbar: ${(e as Error).message}` });
  }
}
