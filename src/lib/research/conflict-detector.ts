/**
 * Phase E: Provider-Conflict-Detector.
 * Vergleicht gleiche Metriken aus verschiedenen Quellen und flaggt
 * Abweichungen oberhalb der Schwellwerte aus thresholds.ts.
 *
 * Wird in stepDeriveMetrics aufgerufen; Ergebnisse gehen als Red-Flag
 * in den Report.
 */
import type { ProviderFact } from "@/lib/providers/types";
import { THRESHOLDS } from "./thresholds";

export type ConflictSeverity = "low" | "medium" | "high";

export interface ProviderConflict {
  field: string;
  values: Array<{ provider: string; value: number }>;
  relativeSpread: number;   // (max - min) / |median|
  severity: ConflictSeverity;
}

/**
 * Extracts the plain-number value from a ProviderFact.
 */
function toNum(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "object" && val !== null) {
    const r = val as Record<string, unknown>;
    for (const k of ["val", "value", "raw"]) {
      const n = typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : null;
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Detects provider conflicts for the given set of facts.
 * Returns a list of conflicts sorted by severity (high first).
 *
 * Only considers facts with a `provider` field in their URL.
 */
export function detectProviderConflicts(facts: ProviderFact[]): ProviderConflict[] {
  // Group numeric facts by field
  const byField = new Map<string, Array<{ provider: string; value: number }>>();

  for (const fact of facts) {
    // Skip derived fields
    if (fact.field.startsWith("derived_")) continue;
    // Skip non-numeric fields
    const num = toNum(fact.value);
    if (num === null) continue;
    // Infer provider from url or field prefix
    const provider = fact.url
      ? new URL(fact.url.startsWith("http") ? fact.url : `https://unknown/${fact.url}`).hostname
      : "unknown";

    const existing = byField.get(fact.field) ?? [];
    // Avoid duplicate provider entries (keep latest)
    const idx = existing.findIndex((e) => e.provider === provider);
    if (idx >= 0) {
      existing[idx]!.value = num;
    } else {
      existing.push({ provider, value: num });
    }
    byField.set(fact.field, existing);
  }

  const conflicts: ProviderConflict[] = [];

  for (const [field, entries] of byField) {
    if (entries.length < 2) continue;
    const values = entries.map((e) => e.value).sort((a, b) => a - b);
    const min = values[0]!;
    const max = values[values.length - 1]!;
    const median = values[Math.floor(values.length / 2)]!;
    if (median === 0) continue;

    const relativeSpread = (max - min) / Math.abs(median);
    if (relativeSpread <= THRESHOLDS.conflict_medium_threshold) continue;

    let severity: ConflictSeverity;
    if (relativeSpread >= THRESHOLDS.conflict_high_threshold) severity = "high";
    else severity = "medium";

    conflicts.push({ field, values: entries, relativeSpread, severity });
  }

  return conflicts.sort((a, b) => {
    const ord = { high: 0, medium: 1, low: 2 };
    return (ord[a.severity] ?? 2) - (ord[b.severity] ?? 2);
  });
}

/**
 * Converts conflicts to human-readable Red-Flag strings.
 */
export function conflictsToRedFlags(conflicts: ProviderConflict[]): string[] {
  return conflicts
    .filter((c) => c.severity !== "low")
    .slice(0, 5) // cap at 5 to avoid noise
    .map((c) => {
      const spread = (c.relativeSpread * 100).toFixed(0);
      const providers = c.values.map((v) => `${v.provider}: ${v.value.toFixed(2)}`).join(" vs ");
      return `Datenwiderspruch [${c.severity.toUpperCase()}] ${c.field} (Abw. ${spread}%): ${providers}`;
    });
}
