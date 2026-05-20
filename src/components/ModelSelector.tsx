"use client";
/**
 * ModelSelector – Dropdown für lokale Ollama-Modelle.
 * Liest /api/ollama/models. Optional `value`/`onChange` für kontrollierten Zustand.
 */
import { useEffect, useState } from "react";

interface Props {
  value?: string;
  onChange?: (model: string) => void;
  placeholder?: string;
}

export function ModelSelector({ value, onChange, placeholder = "auto" }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/ollama/models", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { models?: { name: string }[] };
        if (cancelled) return;
        setModels((data.models ?? []).map((m) => m.name));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <select
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="bg-secondary-900 border border-secondary-700 rounded-md px-3 py-1.5 text-sm focus:border-accent-500 outline-none"
        disabled={loading}
      >
        <option value="">{placeholder}</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {loading ? <span className="text-xs text-secondary-500">lade…</span> : null}
      {error ? <span className="text-xs text-red-400">Ollama: {error}</span> : null}
    </div>
  );
}
