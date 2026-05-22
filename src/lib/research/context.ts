import type { ProviderFact, SourceClass } from "@/lib/providers/types";
import type { BlockKey } from "@/lib/scoring/weights";

interface SourceRef {
  url: string;
  title?: string;
  klass: SourceClass;
}

export interface ResearchContext {
  sourceMap: Map<number, SourceRef>;
  sourceIndexByUrl: Map<string, number>;
  sourceEvidence: Map<number, string>;
  context: string;
  blockContexts: Record<BlockKey, string>;
}

const GLOBAL_MAX_CHARS = 18_000;  // Kleiner → schnellerer Prefill
const BLOCK_MAX_CHARS = 12_000;   // Pro Block ausreichend
const COMMON_MAX_FACTS = 50;
const BLOCK_MAX_FACTS = 60;

const BLOCK_FIELD_HINTS: Record<BlockKey, string[]> = {
  growth_market: [
    "revenue",
    "growth",
    "arr",
    "nrr",
    "retention",
    "customer",
    "segment",
    "market",
    "tam",
    "earnings_quarterly",
    "income_statement",
    "analyst_estimates",
    "derived_revenue",
  ],
  unit_economics_margins: [
    "margin",
    "gross",
    "operating",
    "ebitda",
    "cashflow",
    "free_cashflow",
    "rule_of",
    "sbc",
    "expense",
    "ratio",
    "derived_fcf",
    "derived_rule",
  ],
  quality_moat: [
    "roic",
    "gross_margin",
    "retention",
    "churn",
    "market_share",
    "business_summary",
    "industry",
    "sic_description",
    "segment",
    "derived_roic",
  ],
  valuation: [
    "price",
    "market_cap",
    "enterprise",
    "pe",
    "peg",
    "ev",
    "valuation",
    "target",
    "analyst_estimates",
    "derived_ev",
  ],
  capital_discipline_dilution: [
    "share",
    "sbc",
    "stock",
    "cash",
    "debt",
    "runway",
    "buyback",
    "cashflow",
    "balance_sheet",
    "derived_share",
    "derived_sbc",
    "derived_net_debt",
  ],
  catalysts_revisions_sentiment: [
    "news",
    "rss",
    "filing_8-k",
    "analyst",
    "estimate",
    "revision",
    "guidance",
    "target",
    "recommendation",
    "earnings",
  ],
  risk_fragility: [
    "risk",
    "beta",
    "debt",
    "cash",
    "current_ratio",
    "short",
    "concentration",
    "regulation",
    "balance_sheet",
    "news",
    "derived_net_debt",
    "derived_fcf",
  ],
};

const COMMON_FIELD_HINTS = [
  "company_name",
  "exchange",
  "sector",
  "industry",
  "country",
  "website",
  "currency",
  "price",
  "market_cap",
  "revenue_growth_yoy",
  "revenue_ttm",
  "gross_margin",
  "operating_margin",
  "free_cashflow",
  "total_cash",
  "total_debt",
  "beta",
  "derived_",
  "filing_10-k",
  "filing_10-q",
];

const SOURCE_CLASS_RANK: Record<SourceClass, number> = {
  A: 0,
  "A-": 1,
  B: 2,
  "B-": 3,
  C: 4,
  D: 5,
  E: 6,
};

function lowerField(f: ProviderFact): string {
  return `${f.field} ${f.title ?? ""}`.toLowerCase();
}

function matchesAny(text: string, hints: string[]): boolean {
  return hints.some((hint) => text.includes(hint.toLowerCase()));
}

function scoreFactForBlock(f: ProviderFact, block: BlockKey): number {
  const text = lowerField(f);
  let score = matchesAny(text, BLOCK_FIELD_HINTS[block]) ? 10 : 0;
  if (matchesAny(text, COMMON_FIELD_HINTS)) score += 2;
  score += Math.max(0, 6 - SOURCE_CLASS_RANK[f.klass]);
  if (f.asOf) score += 1;
  return score;
}

function sourceSort(a: ProviderFact, b: ProviderFact): number {
  const klass = SOURCE_CLASS_RANK[a.klass] - SOURCE_CLASS_RANK[b.klass];
  if (klass !== 0) return klass;
  return (b.asOf ?? "").localeCompare(a.asOf ?? "");
}

function compactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length > 360 ? `${value.slice(0, 360)} ...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    const limit = depth === 0 ? 6 : 3;
    const arr = value.slice(0, limit).map((v) => compactValue(v, depth + 1));
    if (value.length > limit) arr.push(`...[${value.length - limit} more items]`);
    return arr;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const limit = depth === 0 ? 18 : 8;
    const out: Record<string, unknown> = {};
    for (const [key, val] of entries.slice(0, limit)) {
      out[key] = compactValue(val, depth + 1);
    }
    if (entries.length > limit) out.__truncated_keys = entries.length - limit;
    return out;
  }
  return String(value);
}

export function summarizeFactValue(value: unknown, maxChars = 1200): string {
  const compact = compactValue(value);
  const json = typeof compact === "string" ? compact : JSON.stringify(compact);
  if (json.length <= maxChars) return json;

  const tiny = typeof value === "object" && value !== null
    ? JSON.stringify({
        type: Array.isArray(value) ? "array" : "object",
        summary: compactValue(value, 2),
        truncated: true,
      })
    : json;
  return tiny.length <= maxChars ? tiny : `${tiny.slice(0, maxChars - 16)} ...[truncated]`;
}

function buildSourceMaps(facts: ProviderFact[]) {
  const sourceMap = new Map<number, SourceRef>();
  const sourceIndexByUrl = new Map<string, number>();
  let idx = 1;
  for (const f of facts) {
    if (!sourceIndexByUrl.has(f.url)) {
      sourceIndexByUrl.set(f.url, idx);
      sourceMap.set(idx, { url: f.url, title: f.title, klass: f.klass });
      idx++;
    }
  }
  return { sourceMap, sourceIndexByUrl };
}

function formatSourceList(sourceMap: Map<number, SourceRef>): string[] {
  const lines = ["# QUELLEN"];
  for (const [i, src] of sourceMap.entries()) {
    lines.push(`[${i}] (${src.klass}) ${src.title ?? ""} - ${src.url}`);
  }
  return lines;
}

function factLine(f: ProviderFact, sourceIndexByUrl: Map<string, number>): string {
  const sIdx = sourceIndexByUrl.get(f.url) ?? 0;
  const asOf = f.asOf ? ` asOf=${f.asOf}` : "";
  return `- [${sIdx}] ${f.field}${asOf}: ${summarizeFactValue(f.value)}`;
}

function takeLines(lines: string[], maxChars: number): string {
  const out: string[] = [];
  let size = 0;
  for (const line of lines) {
    const next = size + line.length + 1;
    if (next > maxChars) {
      out.push(`... [context truncated at line boundary; ${lines.length - out.length} lines omitted]`);
      break;
    }
    out.push(line);
    size = next;
  }
  return out.join("\n");
}

function commonFacts(facts: ProviderFact[]): ProviderFact[] {
  return facts
    .filter((f) => matchesAny(lowerField(f), COMMON_FIELD_HINTS))
    .sort(sourceSort)
    .slice(0, COMMON_MAX_FACTS);
}

function blockFacts(facts: ProviderFact[], block: BlockKey): ProviderFact[] {
  return facts
    .map((fact) => ({ fact, score: scoreFactForBlock(fact, block) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || sourceSort(a.fact, b.fact))
    .slice(0, BLOCK_MAX_FACTS)
    .map((x) => x.fact);
}

function buildSourceEvidence(facts: ProviderFact[], sourceIndexByUrl: Map<string, number>): Map<number, string> {
  const out = new Map<number, string[]>();
  for (const fact of facts) {
    const idx = sourceIndexByUrl.get(fact.url);
    if (!idx) continue;
    const arr = out.get(idx) ?? [];
    arr.push(`${fact.field}: ${summarizeFactValue(fact.value, 900)}`);
    out.set(idx, arr);
  }
  return new Map(Array.from(out.entries()).map(([idx, lines]) => [idx, lines.join("\n")]));
}

export function buildResearchContext(facts: ProviderFact[], blocks: readonly BlockKey[]): ResearchContext {
  const { sourceMap, sourceIndexByUrl } = buildSourceMaps(facts);
  const sourceLines = formatSourceList(sourceMap);
  const common = commonFacts(facts);
  const commonLines = ["", "# GEMEINSAMER KERN", ...common.map((f) => factLine(f, sourceIndexByUrl))];

  const globalLines = [...sourceLines, ...commonLines, "", "# FAKTEN NACH RESEARCH-BLOCK"];
  const blockContexts = {} as Record<BlockKey, string>;

  for (const block of blocks) {
    const factsForBlock = blockFacts(facts, block);
    const blockLines = [
      ...sourceLines,
      ...commonLines,
      "",
      `# BLOCK-SPEZIFISCHE FAKTEN: ${block}`,
      ...factsForBlock.map((f) => factLine(f, sourceIndexByUrl)),
    ];
    blockContexts[block] = takeLines(blockLines, BLOCK_MAX_CHARS);

    globalLines.push("");
    globalLines.push(`## ${block}`);
    globalLines.push(...factsForBlock.slice(0, 35).map((f) => factLine(f, sourceIndexByUrl)));
  }

  return {
    sourceMap,
    sourceIndexByUrl,
    sourceEvidence: buildSourceEvidence(facts, sourceIndexByUrl),
    context: takeLines(globalLines, GLOBAL_MAX_CHARS),
    blockContexts,
  };
}
