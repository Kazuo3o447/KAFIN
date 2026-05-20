/**
 * Common Provider-Interface.
 * Jeder Adapter liefert "Fakten" (typed key-value mit Quelle) und ggf. raw Artefakte
 * (JSON/CSV) die unter `data/raw/{TICKER}/{runId}/` persistiert werden.
 *
 * Klassen-Tags entsprechen research.md §11 (Quellenklassen):
 * - A   = Primärquelle (Filings, Investor Relations PDFs/PR)
 * - A-  = Aggregierte Primärdaten (SEC EDGAR companyfacts)
 * - B   = Etablierte Finanzdaten-APIs (Yahoo, FMP, AV)
 * - B-  = Konsens/Analyst-Schätzungen
 * - C   = Tier-1 News (Reuters, Bloomberg, FT, WSJ)
 * - D   = Tier-2 News, Foren-Aggregat
 * - E   = Anekdotisch, niedrig priorisiert
 */
export type SourceClass = "A" | "A-" | "B" | "B-" | "C" | "D" | "E";

export interface ProviderFact {
  /** semantischer Schlüssel z.B. "revenue_ttm", "share_count", "filing_10K_url" */
  field: string;
  value: unknown;
  /** Quell-URL (Pflicht für Audit-Trail) */
  url: string;
  title?: string;
  /** ISO-Datum oder ISO-Timestamp wann der Wert gilt */
  asOf?: string;
  klass: SourceClass;
}

export interface RawArtifact {
  name: string;
  contentType: "application/json" | "text/csv" | "text/plain" | "text/html";
  data: string | object;
}

export interface ProviderResult {
  provider: string;
  ok: boolean;
  facts: ProviderFact[];
  raw: RawArtifact[];
  error?: string;
  /** ms */
  durationMs: number;
}

export interface ProviderContext {
  ticker: string;
  /** ISO date des Run-Starts, für `asOf` Defaults */
  runDate: string;
  /** Optionale Hooks für Logging via Orchestrator */
  log?: (msg: string) => void;
  /** AbortSignal für Cancel */
  signal?: AbortSignal;
}

export interface DataProvider {
  /** stabile ID, z.B. "yahoo", "edgar" */
  name: string;
  /** true wenn Adapter ohne Konfiguration nutzbar ist (z.B. Yahoo, EDGAR mit UA-Default) */
  available(): boolean;
  fetch(ctx: ProviderContext): Promise<ProviderResult>;
}
