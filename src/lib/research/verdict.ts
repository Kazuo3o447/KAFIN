/**
 * Verdict-Generator (Phase F.2).
 * Deterministisches Label aus Gate / Kategorie / Hard Blockers / Fair-Value-Klassifikation.
 *
 * research.md §40
 */
import type { BlockKey } from "@/lib/scoring/weights";
import { BLOCK_WEIGHTS } from "@/lib/scoring/weights";
import type { Gate, Category } from "@/lib/scoring/gate";
import type { FairValueClassification } from "@/lib/research/fair-value";

export type Confidence = "low" | "medium" | "high";

export interface VerdictInput {
  gate: Gate;
  category: Category;
  confidence: Confidence;
  scoreTotal: number;
  hardBlockers: string[];
  scoreBreakdown: Record<BlockKey, number>;
  weights?: Record<BlockKey, number>;
  fairValueClassification: FairValueClassification | null;
  upsidePct: number | null;
}

export interface VerdictResult {
  label: string;        // deterministisch, max 70 Zeichen
  reasonCode: string;   // stabiler Schlüssel
  weakestBlock: BlockKey | null;
}

// ─── Blocker short-form mapping ───────────────────────────────────────────────

const BLOCKER_SHORTS: Array<[RegExp, string]> = [
  [/cash.?runway/i, "Cash Runway"],
  [/bilanzstress/i, "Bilanzstress"],
  [/altman/i, "Bilanzstress"],
  [/beneish/i, "Accounting-Risiko"],
  [/dilut/i, "Verwässerung"],
  [/fcf.*negati|negati.*fcf/i, "Negativer FCF"],
  [/debt|verschuld/i, "Überschuldung"],
];

function shortenBlocker(raw: string): string {
  for (const [re, short] of BLOCKER_SHORTS) {
    if (re.test(raw)) return short;
  }
  // Fallback: first 30 chars
  return raw.slice(0, 30).replace(/\.$/, "");
}

// ─── Category label mapping ───────────────────────────────────────────────────

const CATEGORY_REASON: Record<Category, { label: string; code: string }> = {
  "Hype/Risk":     { label: "Hype-Risiko",          code: "cat_hype_risk" },
  "Dilution Trap": { label: "Verwässerung",          code: "cat_dilution" },
  "Broken Growth": { label: "brechendes Wachstum",   code: "cat_broken_growth" },
  "Too Hard":      { label: "unzureichende Daten",   code: "cat_too_hard" },
  "Ignore":        { label: "nicht relevant",         code: "cat_ignore" },
  "Rocket":        { label: "Rakete",                code: "cat_rocket" },
  "Quality Growth":{ label: "Quality Growth",        code: "cat_quality_growth" },
  "Transitional":  { label: "Transition",            code: "cat_transitional" },
};

// ─── Block weakness labels ─────────────────────────────────────────────────────

const BLOCK_WEAKNESS: Record<BlockKey, string> = {
  growth_market:                  "Wachstum schwach",
  unit_economics_margins:         "Margen schwach",
  quality_moat:                   "Moat unklar",
  valuation:                      "Bewertung vorgelaufen",
  capital_discipline_dilution:    "Verwässerung beobachten",
  catalysts_revisions_sentiment:  "Sentiment fehlt",
  risk_fragility:                 "Fragilität",
};

// ─── Helper: find weakest block by relative score gap ───────────────────────

export function findWeakestBlock(
  scoreBreakdown: Record<BlockKey, number>,
  weights?: Record<BlockKey, number>,
): BlockKey | null {
  const w = weights ?? BLOCK_WEIGHTS;
  let worstBlock: BlockKey | null = null;
  let worstGap = -Infinity;

  for (const key of Object.keys(w) as BlockKey[]) {
    const max = w[key];
    const actual = scoreBreakdown[key] ?? 0;
    const relativeGap = max > 0 ? (max - actual) / max : 0;
    if (relativeGap > worstGap) {
      worstGap = relativeGap;
      worstBlock = key;
    }
  }
  return worstBlock;
}

// ─── Hard Blocker Block mapping (for auto-expand) ────────────────────────────

export const BLOCKER_BLOCK_MAP: Array<[RegExp, BlockKey]> = [
  [/cash.?runway/i,              "risk_fragility"],
  [/altman/i,                    "risk_fragility"],
  [/beneish/i,                   "risk_fragility"],
  [/dilut/i,                     "capital_discipline_dilution"],
  [/fcf.*negati|negati.*fcf/i,   "risk_fragility"],
  [/debt|verschuld/i,            "risk_fragility"],
];

export function blockerToBlock(blocker: string): BlockKey | null {
  for (const [re, block] of BLOCKER_BLOCK_MAP) {
    if (re.test(blocker)) return block;
  }
  return null;
}

// ─── Main: buildVerdict ───────────────────────────────────────────────────────

export function buildVerdict(input: VerdictInput): VerdictResult {
  const weights = input.weights ?? BLOCK_WEIGHTS;
  const weakestBlock = findWeakestBlock(input.scoreBreakdown, weights);

  // 1. Hard Blockers take precedence (even if gate is somehow Green)
  if (input.hardBlockers.length > 0) {
    const short = shortenBlocker(input.hardBlockers[0]!);
    return {
      label: `Blocked — ${short}`.slice(0, 70),
      reasonCode: "hard_blocker",
      weakestBlock,
    };
  }

  // 2. Gate Red (no hard blockers)
  if (input.gate === "Red") {
    const cat = CATEGORY_REASON[input.category] ?? { label: input.category, code: "cat_other" };
    return {
      label: `Pass — ${cat.label}`.slice(0, 70),
      reasonCode: cat.code,
      weakestBlock,
    };
  }

  // 3. Gate Yellow
  if (input.gate === "Yellow") {
    const catLabel = input.category;
    let weaknessLabel = weakestBlock ? (BLOCK_WEAKNESS[weakestBlock] ?? "unbekannte Schwäche") : "unbekannte Schwäche";

    // Override weakness label if valuation is weakest AND FV is overvalued
    if (weakestBlock === "valuation" && input.fairValueClassification === "overvalued") {
      weaknessLabel = "Bewertung extrem";
    }

    return {
      label: `${catLabel}-Kandidat — ${weaknessLabel}`.slice(0, 70),
      reasonCode: "yellow_" + (weakestBlock ?? "unknown"),
      weakestBlock,
    };
  }

  // 4. Gate Green
  const catLabel = input.category;
  let suffix = "";
  if (input.fairValueClassification === "deep_value") {
    suffix = ", deutlich unter Fair Value";
  }
  return {
    label: `${catLabel} — bestätigt${suffix}`.slice(0, 70),
    reasonCode: "green_confirmed",
    weakestBlock,
  };
}

// ─── Verdict-Detail sanitizer ─────────────────────────────────────────────────

const FORBIDDEN_WORDS = [
  "kauf",  // catches Kauf, kaufen
  "kaufen", "verkaufen", "halten",
  "target", "kursziel", "empfehlung",
  "buy", "sell", "hold",
  "strong buy", "strong sell",
];

/**
 * Validate LLM verdict detail. Returns original if clean, fallback otherwise.
 */
export function sanitizeVerdictDetail(detail: string | null | undefined, fallbackLabel: string): string {
  if (!detail || detail.trim().length === 0) {
    return `${fallbackLabel}. Siehe Block-Detail.`;
  }
  const lower = detail.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    if (lower.includes(word)) {
      return `${fallbackLabel}. Siehe Block-Detail.`;
    }
  }
  return detail.slice(0, 200);
}
