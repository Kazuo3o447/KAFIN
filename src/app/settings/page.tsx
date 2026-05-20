"use client";
/**
 * Settings – einfache Form, persistiert Werte über /api/settings (folgt).
 * Für jetzt: rein lokal in localStorage, mit ModelSelector-Anbindung.
 */
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { ModelSelector } from "@/components/ModelSelector";
import { showToast } from "@/components/Toast";

const KEYS = {
  defaultModel: "kafin.defaultModel",
  ollamaBaseUrl: "kafin.ollamaBaseUrl",
};

export default function SettingsPage() {
  const [model, setModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setModel(localStorage.getItem(KEYS.defaultModel) ?? "");
    setOllamaUrl(localStorage.getItem(KEYS.ollamaBaseUrl) ?? "http://localhost:11434");
    setLoaded(true);
  }, []);

  function save() {
    localStorage.setItem(KEYS.defaultModel, model);
    localStorage.setItem(KEYS.ollamaBaseUrl, ollamaUrl);
    showToast("Einstellungen lokal gespeichert", "success");
  }

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-secondary-400 mt-1">
          Hinweis: Server-seitige Werte stammen aus <code className="font-mono">.env</code> (siehe
          <code className="font-mono mx-1">.env.example</code>).
        </p>
      </header>

      <GlassCard className="p-6 space-y-5">
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
            Server-Default kommt aus <code className="font-mono">OLLAMA_BASE_URL</code>.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={save}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-md text-sm font-medium text-white"
          >
            Speichern
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-2 text-sm text-secondary-400">
        <h2 className="text-base font-medium text-secondary-100 mb-2">Provider-Keys (server-seitig)</h2>
        <p>
          Im <code className="font-mono">.env</code> setzen: <code className="font-mono">FMP_API_KEY</code>,
          <code className="font-mono"> ALPHA_VANTAGE_API_KEY</code>,
          <code className="font-mono"> EDGAR_USER_AGENT</code>.
        </p>
        <p className="text-xs text-secondary-500">
          Yahoo & RSS benötigen keine Keys. EDGAR braucht einen User-Agent gemäß SEC-Regeln.
        </p>
      </GlassCard>
    </main>
  );
}
