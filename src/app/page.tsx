"use client";
/**
 * Startseite — Ticker-Eingabe + Modell-Wahl, startet einen Run.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/GlassCard";
import { showToast } from "@/components/Toast";

export default function HomePage() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [busy, setBusy] = useState(false);

  const [provider, setProvider] = useState<"ollama" | "deepseek" | null>(null);
  const [providerStatus, setProviderStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Aktuellen LLM-Provider laden und sofort testen
  useEffect(() => {
    fetch("/api/settings?key=llm_provider")
      .then((r) => r.json())
      .then((d: { value: unknown }) => {
        const p = d.value === "deepseek" ? "deepseek" : "ollama";
        setProvider(p);
        // Provider im Hintergrund testen
        fetch("/api/settings/test-llm")
          .then((r) => r.json())
          .then((s: { ok: boolean; message: string }) => setProviderStatus(s))
          .catch(() => {});
      })
      .catch(() => setProvider("ollama"));
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) {
      showToast("Ungültiges Ticker-Format (z.B. AAPL, BRK.B)", "warning");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ticker: t };
      // Gespeichertes Ollama-Modell aus den Einstellungen verwenden
      const savedModel = localStorage.getItem("kafin.defaultModel");
      if (savedModel && provider !== "deepseek") {
        body.modelOverride = { extract: savedModel, scoring: savedModel, summary: savedModel };
      }
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { runId: string };
      showToast(`Run gestartet: ${t}`, "success");
      router.push(`/run/${encodeURIComponent(t)}?runId=${data.runId}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Fehler beim Start", "error");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Aktien-Research</h1>
        <p className="text-sm text-secondary-400 mt-1">
          Fundamentale Analyse mit{" "}
          {provider === "deepseek" ? (
            <span className="text-accent-400 font-medium">DeepSeek API</span>
          ) : (
            <span className="text-secondary-300 font-medium">Ollama (lokal)</span>
          )}
          . Eingabe Ticker → SSE-Progress → Audit-Dashboard.
        </p>
      </header>

      {/* Provider-Statusbanner */}
      {providerStatus && !providerStatus.ok && (
        <div className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          <span className="text-base leading-none mt-0.5 shrink-0">✗</span>
          <div>
            <span className="font-medium">
              {provider === "deepseek" ? "DeepSeek API" : "Ollama"} nicht erreichbar
            </span>
            <span className="text-red-400 ml-2">{providerStatus.message}</span>
            <Link href="/settings" className="ml-3 underline underline-offset-2 hover:text-red-200">
              Einstellungen →
            </Link>
          </div>
        </div>
      )}
      {providerStatus && providerStatus.ok && (
        <div className="flex items-center gap-2 text-xs text-secondary-500">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          {provider === "deepseek" ? "DeepSeek API" : "Ollama"} · {providerStatus.message}
        </div>
      )}

      <GlassCard className="p-6">
        <form onSubmit={start} className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs uppercase tracking-wide text-secondary-500">Ticker</label>
            <input
              autoFocus
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="z.B. AAPL"
              className="mt-1 w-full bg-secondary-900 border border-secondary-700 rounded-md px-3 py-2 text-base font-mono focus:border-accent-500 outline-none"
              maxLength={10}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-md text-sm font-medium text-white transition-colors"
          >
            {busy ? "Starte…" : "Research starten"}
          </button>
        </form>
      </GlassCard>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/reports" className="contents">
          <GlassCard className="p-5 cursor-pointer">
            <div className="text-xs uppercase text-secondary-500">Bibliothek</div>
            <div className="text-base font-medium mt-1">Reports anzeigen</div>
            <div className="text-xs text-secondary-500 mt-2">alle abgeschlossenen Audits</div>
          </GlassCard>
        </Link>
        <Link href="/watchlist" className="contents">
          <GlassCard className="p-5 cursor-pointer">
            <div className="text-xs uppercase text-secondary-500">Pinned</div>
            <div className="text-base font-medium mt-1">Watchlist</div>
            <div className="text-xs text-secondary-500 mt-2">Versions-Diff & Re-Runs</div>
          </GlassCard>
        </Link>
        <Link href="/logs" className="contents">
          <GlassCard className="p-5 cursor-pointer">
            <div className="text-xs uppercase text-secondary-500">Audit</div>
            <div className="text-base font-medium mt-1">Logs</div>
            <div className="text-xs text-secondary-500 mt-2">Pipeline-Logs & LLM-Audit</div>
          </GlassCard>
        </Link>
      </section>
    </main>
  );
}
