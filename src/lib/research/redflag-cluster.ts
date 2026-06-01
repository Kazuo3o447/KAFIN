import type { BlockId } from "@/lib/llm/prompts";

export interface RedFlagCluster {
  key: string;
  severity: 1 | 2 | 3;
  representative: string;
  mergedFrom: string[];
  canonicalBlock?: BlockId;
}

const CLUSTERS: Array<{ key: string; severity: 1 | 2 | 3; patterns: RegExp[] }> = [
  { key: "debt_or_convertible", severity: 2, patterns: [/convertible/i, /notes? offering/i, /debt raise/i, /increasing debt/i] },
  { key: "leverage", severity: 2, patterns: [/net debt\s*\/?\s*ebitda/i, /leverage/i] },
  { key: "negative_operating_margin", severity: 2, patterns: [/negative operating margin/i, /operative marge.*negativ/i] },
  { key: "regulatory", severity: 2, patterns: [/regulatory/i, /regulier/i] },
  { key: "single_product_or_channel_dependency", severity: 2, patterns: [/dependence.*glp/i, /single.*channel/i, /einzelnen vertriebskanal/i] },
  { key: "valuation_risk", severity: 2, patterns: [/valuation/i, /multiple/i, /margin of safety/i] },
  { key: "earnings_guidance", severity: 2, patterns: [/weak earnings/i, /guidance/i, /miss/i, /revision/i] },
];

function findClusterKey(flag: string): { key: string; severity: 1 | 2 | 3 } {
  for (const c of CLUSTERS) {
    if (c.patterns.some((p) => p.test(flag))) {
      return { key: c.key, severity: c.severity };
    }
  }
  return { key: "other", severity: 1 };
}

export function clusterRedFlags(rawFlags: string[]): RedFlagCluster[] {
  const grouped = new Map<string, { severity: 1 | 2 | 3; merged: string[] }>();
  for (const flag of rawFlags) {
    const { key, severity } = findClusterKey(flag);
    const bucket = grouped.get(key);
    if (!bucket) {
      grouped.set(key, { severity, merged: [flag] });
      continue;
    }
    bucket.merged.push(flag);
  }

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      severity: value.severity,
      representative: value.merged[0] ?? key,
      mergedFrom: value.merged,
    }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 7);
}
