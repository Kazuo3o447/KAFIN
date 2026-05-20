/**
 * Provider Registry. Reihenfolge ist signifikant für Faktenpriorität:
 * EDGAR (A/A-) > Yahoo (B) > FMP (B) > AlphaVantage (B) > RSS (C/D).
 */
import { edgarProvider } from "./edgar";
import { yahooProvider } from "./yahoo";
import { fmpProvider } from "./fmp";
import { alphaVantageProvider } from "./alphavantage";
import { rssProvider } from "./rss";
import type { DataProvider, ProviderContext, ProviderResult } from "./types";

export const ALL_PROVIDERS: DataProvider[] = [
  edgarProvider,
  yahooProvider,
  fmpProvider,
  alphaVantageProvider,
  rssProvider,
];

/** Liefert nur die konfigurierten/verfügbaren Provider in Prioritätsreihenfolge. */
export function activeProviders(): DataProvider[] {
  return ALL_PROVIDERS.filter((p) => p.available());
}

/** Führt alle aktiven Provider parallel aus und liefert Ergebnisse. */
export async function fetchAllFacts(ctx: ProviderContext): Promise<ProviderResult[]> {
  const providers = activeProviders();
  return Promise.all(providers.map((p) => p.fetch(ctx)));
}

export type { DataProvider, ProviderContext, ProviderResult } from "./types";
export type { ProviderFact, RawArtifact, SourceClass } from "./types";
