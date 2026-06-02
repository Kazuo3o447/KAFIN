"use client";
/**
 * TradingViewChart — eingebettetes TradingView Advanced Chart Widget.
 *
 * HINWEIS: Dieses Widget ist ein fremder iframe — eigenes Branding, verzögerte
 * Gratis-Daten (15–20 min für viele Symbole), eigene AGB von TradingView.
 * Deshalb Trennung: Board (nativ, unsere Daten) / Chart (TradingView, eingebettet).
 * Symbol-Mapping: Yahoo-Ticker → TradingView-Symbol via SYMBOL_MAP.
 */
import { useEffect, useRef } from "react";

interface Props {
  symbol: string; // Yahoo-Symbol, wird intern gemappt
  height?: number;
}

/** Yahoo → TradingView Symbol-Mapping */
const SYMBOL_MAP: Record<string, string> = {
  "^GSPC":     "SP:SPX",
  "^IXIC":     "NASDAQ:IXIC",
  "^RUT":      "TVC:RUT",
  "^TNX":      "TVC:TNX",
  "^FVX":      "TVC:FVX",
  "^IRX":      "TVC:IRX",
  "^TYX":      "TVC:TYX",
  "^VIX":      "TVC:VIX",
  "^MOVE":     "TVC:MOVE",
  "GC=F":      "COMEX:GC1!",
  "CL=F":      "NYMEX:CL1!",
  "BZ=F":      "NYMEX:BB1!",
  "HG=F":      "COMEX:HG1!",
  "DX-Y.NYB":  "TVC:DXY",
  "BTC-USD":   "COINBASE:BTCUSD",
  "ETH-USD":   "COINBASE:ETHUSD",
  "RSP":       "AMEX:RSP",
  "QQQ":       "NASDAQ:QQQ",
  "IVE":       "AMEX:IVE",
  "XLK":       "AMEX:XLK",
  "XLU":       "AMEX:XLU",
};

function toTradingViewSymbol(yahooSymbol: string): string {
  return SYMBOL_MAP[yahooSymbol] ?? yahooSymbol;
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

export function TradingViewChart({ symbol, height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<unknown>(null);
  const tvSymbol = toTradingViewSymbol(symbol);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Script schon geladen?
    const existingScript = document.getElementById("tv-widget-script");

    function initWidget() {
      if (!window.TradingView) return;
      const containerId = `tv-chart-${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
      if (container) container.id = containerId;

      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: "D",
        timezone: "Europe/Berlin",
        theme: "dark",
        style: "1",
        locale: "de_DE",
        toolbar_bg: "#0d1117",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: containerId,
        backgroundColor: "#050a16",
        gridColor: "rgba(255,255,255,0.04)",
      });
    }

    if (existingScript) {
      initWidget();
    } else {
      const script = document.createElement("script");
      script.id = "tv-widget-script";
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    }

    return () => {
      // Widget-Div leeren beim Unmount
      if (container) container.innerHTML = "";
    };
  }, [symbol, tvSymbol]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-secondary-500 uppercase tracking-widest">
          {tvSymbol}
        </span>
        <span className="text-[9px] text-secondary-700 font-mono">
          via TradingView · ggf. verzögert
        </span>
      </div>
      <div
        ref={containerRef}
        style={{ height }}
        className="rounded-lg overflow-hidden border border-secondary-800"
      />
    </div>
  );
}

// ── Modal-Wrapper ─────────────────────────────────────────────────────────────

interface ModalProps {
  symbol: string;
  label: string;
  onClose: () => void;
}

export function TradingViewChartModal({ symbol, label, onClose }: ModalProps) {
  // ESC zum Schließen
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chart: ${label}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-secondary-950 border border-secondary-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-secondary-100">{label}</span>
            <span className="text-[10px] font-mono text-secondary-500">
              {toTradingViewSymbol(symbol)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-secondary-500 hover:text-secondary-200 text-lg leading-none px-1"
            aria-label="Chart schließen"
          >
            ✕
          </button>
        </div>
        {/* Chart */}
        <div className="p-4">
          <TradingViewChart symbol={symbol} height={480} />
        </div>
      </div>
    </div>
  );
}
