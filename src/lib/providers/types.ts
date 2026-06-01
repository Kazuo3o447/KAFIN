import { z } from "zod";

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

export const SourceClassSchema = z.enum(["A", "A-", "B", "B-", "C", "D", "E"]);

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
  /** optional run-id for raw artifact persistence in V2 collectors */
  runId?: string;
  /** optional as-of for market context fetches */
  asOf?: string;
}

export interface DataProvider {
  /** stabile ID, z.B. "yahoo", "edgar" */
  name: string;
  /** true wenn Adapter ohne Konfiguration nutzbar ist (z.B. Yahoo, EDGAR mit UA-Default) */
  available(): boolean;
  fetch(ctx: ProviderContext): Promise<ProviderResult>;
}

export type Capability =
  | "fundamentals_annual"
  | "fundamentals_quarterly"
  | "estimates"
  | "earnings_history"
  | "prices"
  | "insider"
  | "institutional"
  | "short_interest"
  | "analyst"
  | "segments"
  | "macro"
  | "symbol_resolution";

export type MissingValueStatus =
  | "available"
  | "not_reported"
  | "not_applicable"
  | "fetch_failed"
  | "rate_limited"
  | "stale";

export interface CapabilityFetchDiagnostic {
  capability: Capability;
  status: MissingValueStatus;
  providerTried: string[];
  providerUsed: string | null;
  retries: number;
  errors: string[];
}

export interface GatherDiagnostics {
  capabilities: CapabilityFetchDiagnostic[];
  incompleteDueToTechnicalFailure: boolean;
  retryRecommended: boolean;
}

export interface Provenance {
  source: string;
  url: string;
  klass: SourceClass;
  asOf: string | null;
  stale: boolean;
}

export interface ProviderFetchResultV2 {
  provider: string;
  capability: Capability;
  ok: boolean;
  data: unknown;
  status?: MissingValueStatus;
  provenance: Provenance[];
  raw: RawArtifact[];
  error?: string;
  durationMs: number;
}

export interface DataProviderV2 {
  name: string;
  capabilities: Capability[];
  available(): boolean;
  priorityByCapability: Partial<Record<Capability, number>>;
  fetch(cap: Capability, ctx: ProviderContext): Promise<ProviderFetchResultV2>;
}
