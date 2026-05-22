"use client";
/**
 * Settings – LLM-Provider-Umschalter (Ollama ↔ DeepSeek) + Ollama-Konfiguration.
 * LLM-Einstellungen werden server-seitig in der DB gespeichert (/api/settings).
 */
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { ModelSelector } from "@/components/ModelSelector";
import { showToast } from "@/components/Toast";

const LS = {
  defaultModel: "kafin.defaultModel",
  ollamaBaseUrl: "kafin.ollamaBaseUrl",
};

type Provider = "ollama" | "deepseek";

async function apiGet(key: string): Promise<unknown> {
  const res = await fetch(`/api/settings?key=${encodeURIComponent(key)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { value: unknown };
  return json.value;
}

async function apiSet(key: string, value: unknown): Promise<void> {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
}

export default function SettingsPage() {
  // Ollama (localStorage)
  const [model, setModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");

  // LLM-Provider (server-seitig)
  const [provider, setProvider] = useState<Provider>("ollama");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [showKey, setShowKey] = useState(false);

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // Lokale Einstellungen
    setModel(localStorage.getItem(LS.defaultModel) ?? "");
    setOllamaUrl(localStorage.getItem(LS.ollamaBaseUrl) ?? "http://localhost:11434");

    // Server-seitige LLM-Einstellungen laden
    Promise.all([
      apiGet("llm_provider"),
      apiGet("deepseek_api_key"),
      apiGet("deepseek_model"),
    ]).then(([prov, key, mdl]) => {
      if (prov === "deepseek" || prov === "ollama") setProvider(prov);
      if (typeof key === "string" && key) setDeepseekKey(key);
      if (typeof mdl === "string" && mdl) setDeepseekModel(mdl);
      setLoaded(true);
    });
  }, []);

  async function save() {
    setSaving(true);
    setTestResult(null);
    try {
      // Lokale Einstellungen
      localStorage.setItem(LS.defaultModel, model);
      localStorage.setItem(LS.ollamaBaseUrl, ollamaUrl);

      // LLM-Provider server-seitig speichern
      await apiSet("llm_provider", provider);
      if (provider === "deepseek") {
        await apiSet("deepseek_api_key", deepseekKey.trim());
        await apiSet("deepseek_model", deepseekModel.trim() || "deepseek-chat");
      }

      showToast("Einstellungen gespeichert", "success");
    } catch {
      showToast("Fehler beim Speichern", "error");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    // Zuerst speichern, damit der Test die aktuellen Werte nutzt
    await apiSet("llm_provider", provider);
    if (provider === "deepseek") {
      await apiSet("deepseek_api_key", deepseekKey.trim());
      await apiSet("deepseek_model", deepseekModel.trim() || "deepseek-chat");
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-llm");
      const json = (await res.json()) as { ok: boolean; message: string };
      setTestResult(json);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-secondary-400 mt-1">
          LLM-Provider-Einstellungen werden in der lokalen Datenbank gespeichert.
        </p>
      </header>

      {/* ── LLM Provider ────────────────────────────────────────── */}
      <GlassCard className="p-6 space-y-5">
        <h2 className="text-base font-semibold text-secondary-100">LLM Provider</h2>

        {/* Toggle */}
        <div className="flex items-center gap-2 p-1 bg-secondary-900 rounded-lg w-fit border border-secondary-700">
          <button
            onClick={() => setProvider("ollama")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              provider === "ollama"
                ? "bg-primary-600 text-white shadow"
                : "text-secondary-400 hover:text-secondary-200"
            }`}
          >
            Ollama (lokal)
          </button>
          <button
            onClick={() => setProvider("deepseek")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              provider === "deepseek"
                ? "bg-accent-600 text-white shadow"
                : "text-secondary-400 hover:text-secondary-200"
            }`}
          >
            DeepSeek API
          </button>
        </div>

        {/* Ollama-spezifisch */}
        {provider === "ollama" && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs uppercase tracking-wide text-secondary-500">Default-Modell</label>
              <div className="mt-1">
                <ModelSelector value={model} onChange={setModel} />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-secondary-500">Ollama Base URL</label>
              <input
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="mt-1 w-full bg-secondary-900 border border-secondary-700 rounded-md px-3 py-2 text-sm font-mono focus:border-accent-500 outline-none"
              />
              <p className="text-xs text-secondary-500 mt-1">
                Server-Default aus <code className="font-mono">OLLAMA_BASE_URL</code>.
              </p>
            </div>
          </div>
        )}

        {/* DeepSeek-spezifisch */}
        {provider === "deepseek" && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs uppercase tracking-wide text-secondary-500">API Key</label>
              <div className="mt-1 relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-secondary-900 border border-secondary-700 rounded-md px-3 py-2 text-sm font-mono focus:border-accent-500 outline-none pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary-400 hover:text-secondary-200"
                >
                  {showKey ? "Verbergen" : "Anzeigen"}
                </button>
              </div>
              <p className="text-xs text-secondary-500 mt-1">
                Wird verschlüsselt-frei in der lokalen SQLite-DB gespeichert.
              </p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-secondary-500">Modell</label>
              <input
                value={deepseekModel}
                onChange={(e) => setDeepseekModel(e.target.value)}
                placeholder="deepseek-chat"
                className="mt-1 w-full bg-secondary-900 border border-secondary-700 rounded-md px-3 py-2 text-sm font-mono focus:border-accent-500 outline-none"
              />
              <p className="text-xs text-secondary-500 mt-1">
                Empfohlen: <code className="font-mono">deepseek-chat</code> oder{" "}
                <code className="font-mono">deepseek-reasoner</code>.
              </p>
            </div>
          </div>
        )}

        {/* Verbindungstest-Ergebnis */}
        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
              testResult.ok
                ? "bg-green-950/60 border border-green-800 text-green-300"
                : "bg-red-950/60 border border-red-800 text-red-300"
            }`}
          >
            <span className="text-base leading-none mt-0.5">{testResult.ok ? "✓" : "✗"}</span>
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="pt-2 flex gap-3 flex-wrap">
          <button
            onClick={save}
            disabled={saving || testing}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-md text-sm font-medium text-white"
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
          <button
            onClick={testConnection}
            disabled={saving || testing}
            className="px-4 py-2 bg-secondary-800 hover:bg-secondary-700 disabled:opacity-50 border border-secondary-600 rounded-md text-sm font-medium text-secondary-200"
          >
            {testing ? "Teste…" : "Verbindung testen"}
          </button>
        </div>
      </GlassCard>

      {/* ── Data-Provider-Keys ────────────────────────────────────── */}
      <GlassCard className="p-6 space-y-2 text-sm text-secondary-400">
        <h2 className="text-base font-medium text-secondary-100 mb-2">Data-Provider-Keys (server-seitig)</h2>
        <p>
          Im <code className="font-mono">.env</code> setzen: <code className="font-mono">FMP_API_KEY</code>,{" "}
          <code className="font-mono">ALPHA_VANTAGE_API_KEY</code>,{" "}
          <code className="font-mono">EDGAR_USER_AGENT</code>.
        </p>
        <p className="text-xs text-secondary-500">
          Yahoo & RSS benötigen keine Keys. EDGAR braucht einen User-Agent gemäß SEC-Regeln.
        </p>
      </GlassCard>
    </main>
  );
}
