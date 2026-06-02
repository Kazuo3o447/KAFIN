"use client";
/**
 * /markets — Marktgesundheits-Dashboard
 *
 * Terminal-Kachel-Layout:
 *   1. Kopfzeile: Risk-Posture (Label + Score) + asOf + Refresh-Button
 *   2. Quotes-Board: dichtes Grid der Asset-Kacheln (nativ, aus eigenen Providern)
 *   3. Drei-Säulen-Streifen + Divergenz-Banner
 *   4. Zins-/Duration-Block + Faktor-Regime
 *   5. KI-Marktanalyse (Chat)
 *
 * Board = nativ (Terminal-Look), Chart = TradingView Advanced Chart (eingebettet).
 * Embed über Settings-Konfig, nicht hart verdrahtet — Platzhalter wenn nicht konfiguriert.
 *
 * Begründung Momentum-Framework im Kommentar von health.ts:
 * Momentum läuft auf Preis + Revisionen, News als Reaktions-/Katalysator-Overlay.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MarketChatPanel } from "@/components/MarketChatPanel";
import { TradingViewChartModal } from "@/components/TradingViewChart";
import type { MarketHealth, AssetQuote, PillarRead, MomentumComposite } from "@/lib/market/health";

// ── Farb-Utilities ────────────────────────────────────────────────────────────

function postureColor(p: MarketHealth["posture"] | undefined): string {
  if (p === "risk_on") return "text-accent-green";
  if (p === "risk_off") return "text-red-400";
  return "text-amber-400";
}

function pillarColor(state: PillarRead["state"]): string {
  if (state === "risk_on") return "text-accent-green";
  if (state === "risk_off") return "text-red-400";
  return "text-amber-400";
}

function deltaColor(
  change: number | null | undefined,
  category: AssetQuote["category"]
): string {
  if (change == null) return "text-secondary-500";
  // Zinsen und Vol → neutral mit Richtungspfeil, kein Gut/Schlecht
  if (category === "rate" || category === "vol" || category === "credit_proxy") {
    return "text-secondary-400";
  }
  return change >= 0 ? "text-accent-green" : "text-red-400";
}

function formatPrice(price: number | null, category: AssetQuote["category"]): string {
  if (price == null) return "—";
  if (category === "index") return price.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  if (category === "crypto") return price.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function formatDelta(pct: number | null | undefined, category: AssetQuote["category"]): string {
  if (pct == null) return "";
  const arrow = pct >= 0 ? "↑" : "↓";
  if (category === "rate" || category === "vol" || category === "credit_proxy") {
    return `${arrow} ${Math.abs(pct).toFixed(2)}%`;
  }
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

// ── Kachel-Komponenten ────────────────────────────────────────────────────────

function AssetTile({ quote, onClick }: { quote: AssetQuote; onClick: (q: AssetQuote) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-secondary-900 rounded-lg border border-secondary-800 px-3 py-2 flex flex-col gap-0.5 min-w-0 cursor-pointer hover:border-accent-cyan/40 hover:bg-secondary-800/60 transition-colors"
      title={quote.isProxy ? "Verzögerter Proxy-Wert · Klick für Chart" : "Klick für TradingView-Chart"}
      onClick={() => onClick(quote)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(quote); }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-secondary-500 uppercase tracking-wide truncate font-mono">
          {quote.label}
          {quote.isProxy && (
            <span className="ml-1 text-amber-500/70 text-[9px]">≈</span>
          )}
        </span>
        <span
          className={[
            "text-[10px] font-mono shrink-0",
            deltaColor(quote.change1dPct, quote.category),
          ].join(" ")}
        >
          {formatDelta(quote.change1dPct, quote.category)}
        </span>
      </div>
      <span className="text-sm font-mono font-bold text-secondary-100 tabular-nums">
        {formatPrice(quote.price, quote.category)}
      </span>
      {/* MA-Trend Indikator (nur Kurs-basierte Kategorien) */}
      {quote.maTrend && quote.category !== "rate" && quote.category !== "vol" && (
        <span className="text-[9px] font-mono text-secondary-600">
          {quote.maTrend === "above_both" ? "▲ MA" : quote.maTrend === "below_both" ? "▼ MA" : "▷ MA"}
        </span>
      )}
    </div>
  );
}

function QuotesBoard({ quotes, onTileClick }: { quotes: AssetQuote[]; onTileClick: (q: AssetQuote) => void }) {
  const CATEGORY_ORDER: Array<{ cat: AssetQuote["category"]; title: string }> = [
    { cat: "index", title: "Indizes" },
    { cat: "rate", title: "Zinsen" },
    { cat: "vol", title: "Volatilität" },
    { cat: "commodity", title: "Rohstoffe" },
    { cat: "fx", title: "FX" },
    { cat: "crypto", title: "Krypto" },
  ];

  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.map(({ cat, title }) => {
        const items = quotes.filter((q) => q.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <div className="text-[10px] uppercase tracking-widest text-secondary-600 mb-1.5 font-bold">
              {title}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {items.map((q) => (
                <AssetTile key={q.symbol} quote={q} onClick={onTileClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MomentumBlock({ momentum }: { momentum: MomentumComposite }) {
  const scoreColor =
    momentum.score >= 65 ? "text-accent-green" : momentum.score <= 35 ? "text-red-400" : "text-amber-400";
  return (
    <div className="bg-secondary-900 rounded-lg border border-secondary-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-secondary-500 font-bold">Momentum</div>
        <span className={`text-xs font-mono font-bold tabular-nums ${scoreColor}`}>
          {momentum.score}/100
        </span>
      </div>
      <div className="h-1 bg-secondary-800 rounded overflow-hidden mb-2">
        <div
          className={`h-full rounded transition-all duration-500 ${
            momentum.score >= 65 ? "bg-accent-green" : momentum.score <= 35 ? "bg-red-500" : "bg-amber-400"
          }`}
          style={{ width: `${momentum.score}%` }}
        />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-secondary-600">Trend (MA50/200)</span>
          <span className="text-secondary-300">{momentum.price.trend.replace(/_/g, " ")}</span>
        </div>
        {momentum.price.near52wHigh != null && (
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-secondary-600">Abstand 52w-Hoch</span>
            <span className={momentum.price.near52wHigh >= -5 ? "text-accent-green" : "text-secondary-300"}>
              {momentum.price.near52wHigh.toFixed(1)}%
            </span>
          </div>
        )}
        {momentum.breadth.participation != null && (
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-secondary-600">&gt; MA200</span>
            <span className="text-secondary-300">{(momentum.breadth.participation * 100).toFixed(0)}%</span>
          </div>
        )}
        <div className="text-[9px] text-secondary-700 font-mono pt-0.5">
          RS 3m/6m/12m · Revisions · SUE: ausstehend (FMP)
        </div>
      </div>
    </div>
  );
}

function PillarCard({
  title,
  pillar,
}: {
  title: string;
  pillar: PillarRead;
}) {
  const entries = Object.entries(pillar.inputs).filter(([, v]) => v !== null && v !== undefined);
  return (
    <div className="bg-secondary-900 rounded-lg border border-secondary-800 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-secondary-500 font-bold">
          {title}
        </span>
        <span
          className={[
            "text-xs font-mono font-bold",
            pillarColor(pillar.state),
          ].join(" ")}
        >
          {pillar.state.replace("_", "-").toUpperCase()}
        </span>
      </div>
      {/* Subscore bar */}
      <div className="h-1 bg-secondary-800 rounded overflow-hidden">
        <div
          className={[
            "h-full rounded transition-all duration-500",
            pillar.state === "risk_on"
              ? "bg-accent-green"
              : pillar.state === "risk_off"
              ? "bg-red-500"
              : "bg-amber-400",
          ].join(" ")}
          style={{ width: `${pillar.subscore}%` }}
        />
      </div>
      <div className="space-y-0.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between text-[10px] font-mono">
            <span className="text-secondary-600 truncate">{key}</span>
            <span className="text-secondary-300 tabular-nums ml-2">
              {typeof value === "boolean"
                ? value ? "ja" : "nein"
                : typeof value === "number"
                ? value.toFixed(2)
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatesBlock({ rates }: { rates: MarketHealth["rates"] }) {
  const rows = [
    { label: "10Y Nominal", value: rates.tenY, suffix: "%" },
    { label: "10Y Real (TIPS)", value: rates.realTenY, suffix: "%" },
    { label: "ERP", value: rates.erp, suffix: "%" },
    { label: "Kurve 10Y–2Y", value: rates.curve10y2y, suffix: "bp" },
  ];
  return (
    <div className="bg-secondary-900 rounded-lg border border-secondary-800 p-3">
      <div className="text-[10px] uppercase tracking-widest text-secondary-500 font-bold mb-2">
        Zinsen & Duration
      </div>
      <div className="space-y-1">
        {rows.map(({ label, value, suffix }) => (
          <div key={label} className="flex justify-between text-[11px] font-mono">
            <span className="text-secondary-500">{label}</span>
            <span
              className={[
                "tabular-nums",
                value == null
                  ? "text-secondary-600"
                  : label.includes("Real") && value > 2.5
                  ? "text-amber-400"
                  : "text-secondary-200",
              ].join(" ")}
            >
              {value != null ? `${value.toFixed(2)}${suffix}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactorBlock({ factor }: { factor: MarketHealth["factor"] }) {
  function factorLabel(v: string): string {
    return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return (
    <div className="bg-secondary-900 rounded-lg border border-secondary-800 p-3">
      <div className="text-[10px] uppercase tracking-widest text-secondary-500 font-bold mb-2">
        Faktor-Regime
      </div>
      <div className="space-y-1">
        {[
          { label: "Growth vs. Value", value: factor.growthVsValueTrend },
          { label: "Zyklisch vs. Defensiv", value: factor.cyclicalVsDefensive },
          ...(factor.cape != null ? [{ label: "CAPE", value: factor.cape.toFixed(1) }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-[11px] font-mono">
            <span className="text-secondary-500">{label}</span>
            <span className="text-secondary-300">{factorLabel(String(value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const [health, setHealth] = useState<MarketHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chartQuote, setChartQuote] = useState<AssetQuote | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (refresh = false) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    try {
      const url = refresh ? "/api/market/health?refresh=1" : "/api/market/health";
      const res = await fetch(url, { signal: abort.signal, cache: "no-store" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `http_${res.status}`);
      }
      const data = (await res.json()) as MarketHealth;
      setHealth(data);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setFetchError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const posture = health?.posture;
  const score = health?.score;

  return (
    <main className="min-h-screen bg-secondary-950 text-secondary-100 px-4 py-5 space-y-5 max-w-7xl mx-auto">
      {/* TradingView Chart Modal */}
      {chartQuote && (
        <TradingViewChartModal
          symbol={chartQuote.symbol}
          label={chartQuote.label}
          onClose={() => setChartQuote(null)}
        />
      )}
      {/* ── Kopfzeile ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-secondary-600 font-bold mb-0.5">
              Marktgesundheit
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={[
                  "text-2xl font-mono font-bold",
                  postureColor(posture),
                ].join(" ")}
              >
                {posture
                  ? posture.replace("_", "-").toUpperCase()
                  : loading
                  ? "…"
                  : "—"}
              </span>
              {score != null && (
                <span className="text-secondary-400 font-mono text-sm">
                  {score}/100
                </span>
              )}
              {health?.pillarAgreement != null && (
                <span className="text-[10px] font-mono text-secondary-600">
                  {health.pillarAgreement}/3 Säulen
                </span>
              )}
            </div>
          </div>
          {health?.asOf && (
            <span className="text-[10px] font-mono text-secondary-600">
              as-of {health.asOf}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChat((v) => !v)}
            className={[
              "px-3 py-1.5 text-xs rounded border font-mono transition-colors",
              showChat
                ? "bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan"
                : "border-secondary-700 text-secondary-400 hover:border-secondary-600",
            ].join(" ")}
          >
            KI-Marktanalyse {showChat ? "▲" : "▼"}
          </button>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="px-3 py-1.5 text-xs rounded border border-secondary-700 text-secondary-400 hover:border-secondary-600 disabled:opacity-50 font-mono"
          >
            {refreshing ? "…" : "↻ Aktualisieren"}
          </button>
        </div>
      </header>

      {/* ── Fetch-Error ───────────────────────────────────────────────────── */}
      {fetchError && (
        <div
          role="alert"
          className="rounded-lg border border-red-600/40 bg-red-900/20 px-4 py-3 text-sm text-red-400 font-mono"
        >
          ⚠ {fetchError}
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && !fetchError && (
        <div className="text-xs text-secondary-600 font-mono animate-pulse">
          Marktdaten werden abgerufen…
        </div>
      )}

      {health && (
        <>
          {/* ── KI-Chat (kollabierbar) ──────────────────────────────────── */}
          {showChat && (
            <div className="h-96">
              <MarketChatPanel asOf={health.asOf} />
            </div>
          )}

          {/* ── Quotes-Board ───────────────────────────────────────────── */}
          <section>
            <QuotesBoard quotes={health.quotes} onTileClick={setChartQuote} />
          </section>

          {/* ── Drei Säulen ───────────────────────────────────────────── */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-secondary-600 font-bold mb-2">
              Drei bestätigende Säulen
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PillarCard title="Breadth" pillar={health.pillars.breadth} />
              <PillarCard title="Volatilität" pillar={health.pillars.volatility} />
              <PillarCard title="Credit" pillar={health.pillars.credit} />
            </div>
          </section>

          {/* ── Zinsen + Faktor + Momentum ───────────────────────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RatesBlock rates={health.rates} />
            <FactorBlock factor={health.factor} />
            {health.momentum && <MomentumBlock momentum={health.momentum} />}
          </section>

          {/* ── Divergenz-Banner ───────────────────────────────────────── */}
          {health.divergences.length > 0 && (
            <section
              role="status"
              className="rounded-lg border border-amber-600/30 bg-amber-900/10 px-4 py-3"
            >
              <div className="text-[10px] uppercase tracking-widest text-amber-500 font-bold mb-2">
                Frühwarnungen & Divergenzen
              </div>
              <ul className="space-y-1">
                {health.divergences.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs font-mono text-amber-300">
                    <span aria-hidden="true">△</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-2 border-t border-amber-700/20 text-[10px] text-secondary-600 font-mono">
                Diese Marktposture wird as-of in jeden Audit-Report gestempelt und moduliert
                Sizing / Margin-of-Safety / Timing — nie die Growth-/Finance-/Moat-Scores.
              </div>
            </section>
          )}

          {/* ── KI-Zusammenfassung (aus analyze-Endpunkt) ──────────────── */}
          {health.summary && (
            <section className="rounded-lg border border-secondary-800 bg-secondary-900 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-secondary-600 font-bold mb-1">
                KI-Kurzanalyse
              </div>
              <p className="text-xs font-mono text-secondary-300 leading-relaxed">
                {health.summary}
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
