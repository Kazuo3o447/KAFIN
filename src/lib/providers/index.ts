/**
 * Provider Registry. Reihenfolge ist signifikant für Faktenpriorität:
 * EDGAR (A/A-) > Yahoo (B) > FMP (B) > AlphaVantage (B) > RSS (C/D).
 */
import { edgarProvider } from "./edgar";
import { edgarProviderV2 } from "./edgar";
import { edgarInsiderProviderV2 } from "./edgar-insider";
import { edgar13FProviderV2 } from "./edgar-13f";
import { yahooProvider } from "./yahoo";
import { yahooProviderV2 } from "./yahoo";
import { fmpProvider } from "./fmp";
import { fmpProviderV2 } from "./fmp";
import { alphaVantageProvider } from "./alphavantage";
import { alphaVantageProviderV2 } from "./alphavantage";
import { rssProvider } from "./rss";
import { rssProviderV2 } from "./rss";
import { finnhubProviderV2 } from "./finnhub";
import { fredProviderV2 } from "./fred";
import { symbolResolutionProviderV2 } from "./symbol-resolution";
import type { Capability, DataProvider, DataProviderV2, ProviderContext, ProviderResult } from "./types";

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

export const ALL_PROVIDERS_V2: DataProviderV2[] = [
  symbolResolutionProviderV2,
  edgarProviderV2,
  edgarInsiderProviderV2,
  edgar13FProviderV2,
  yahooProviderV2,
  finnhubProviderV2,
  fredProviderV2,
  fmpProviderV2,
  alphaVantageProviderV2,
  rssProviderV2,
];

export function activeProvidersV2(): DataProviderV2[] {
  return ALL_PROVIDERS_V2.filter((p) => p.available());
}

export function providersForCapability(capability: Capability): DataProviderV2[] {
  return activeProvidersV2()
    .filter((p) => p.capabilities.includes(capability))
    .sort(
      (a, b) =>
        (a.priorityByCapability[capability] ?? Number.MAX_SAFE_INTEGER) -
        (b.priorityByCapability[capability] ?? Number.MAX_SAFE_INTEGER),
    );
}

export type { DataProvider, ProviderContext, ProviderResult } from "./types";
export type { Capability, DataProviderV2, ProviderFact, ProviderFetchResultV2, RawArtifact, SourceClass } from "./types";
