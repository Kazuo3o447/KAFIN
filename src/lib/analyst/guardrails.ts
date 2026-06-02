import type { Report } from "@/lib/schemas/report";
import { THRESHOLDS } from "@/lib/research/thresholds";
import type { AxisKey } from "@/lib/scoring/axes";

export type CatalystStatus = "confirmed" | "speculative";

export interface AnalystCatalyst {
  text: string;
  anchorMetric: string | null;
  status: CatalystStatus;
  sourceUrl?: string | null;
  sourceDate?: string | null;
}

// ---------------------------------------------------------------------------
// KI Axis Judgment (P2)
// ---------------------------------------------------------------------------

export type MoatSource =
  | "network_effect"
  | "switching_costs"
  | "intangibles"
  | "cost_advantage"
  | "efficient_scale"
  | null;

export interface KiEvidenceItem {
  claim: string;
  sourceRef: string;
}

export interface KiAxisJudgment {
  axis: AxisKey;
  cot: string;
  ki_subscore: number;       // 0-100
  confidence: number;        // 0-1
  rating: string;
  moatSource?: MoatSource;
  durabilityYears?: number | null;
  evidence: KiEvidenceItem[];
  threats: string[];
}

/** Result of verifying a KiAxisJudgment against the deterministic report. */
export interface VerifierResult {
  /** fraction of evidence items that are grounded in the report numbers (0-1) */
  hitRate: number;
  groundedCount: number;
  totalClaims: number;
}

/**
 * Verifies that KI evidence items cite numbers that exist in the report.
 * A claim is considered "grounded" when the report contains at least one
 * number within analyst_number_tolerance of a number found in the claim text.
 */
export function verifyKiAxisJudgment(report: Readonly<Report>, judgment: KiAxisJudgment): VerifierResult {
  const reportNumbers = collectNumbers(report);
  if (judgment.evidence.length === 0) return { hitRate: 0, groundedCount: 0, totalClaims: 0 };

  let grounded = 0;
  for (const item of judgment.evidence) {
    const tokens = (item.claim + " " + item.sourceRef).match(NUMBER_PATTERN) ?? [];
    const hasGroundedNumber = tokens.some((t) => {
      const parsed = parseNumberToken(t);
      return parsed !== null && numberCovered(parsed, reportNumbers) !== null;
    });
    if (hasGroundedNumber) grounded++;
  }

  const hitRate = grounded / judgment.evidence.length;
  return { hitRate, groundedCount: grounded, totalClaims: judgment.evidence.length };
}

/**
 * Clamps ki_subscore to valid range and ensures confidence is bounded.
 * Returns null if the judgment is structurally invalid (missing required fields).
 */
export function sanitizeKiAxisJudgment(raw: unknown): KiAxisJudgment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.axis !== "string") return null;
  if (typeof r.ki_subscore !== "number" || !Number.isFinite(r.ki_subscore)) return null;
  if (typeof r.confidence !== "number" || !Number.isFinite(r.confidence)) return null;
  if (typeof r.rating !== "string") return null;
  const axis = r.axis as AxisKey;
  const ki_subscore = Math.max(0, Math.min(100, r.ki_subscore));
  const confidence = Math.max(0, Math.min(1, r.confidence));
  const evidence: KiEvidenceItem[] = Array.isArray(r.evidence)
    ? (r.evidence as KiEvidenceItem[]).filter(
        (e) => e && typeof e.claim === "string" && typeof e.sourceRef === "string",
      )
    : [];
  const threats: string[] = Array.isArray(r.threats)
    ? (r.threats as string[]).filter((t) => typeof t === "string")
    : [];
  return {
    axis,
    cot: typeof r.cot === "string" ? r.cot : "",
    ki_subscore,
    confidence,
    rating: r.rating as string,
    moatSource: (r.moatSource as MoatSource) ?? null,
    durabilityYears: typeof r.durabilityYears === "number" ? r.durabilityYears : null,
    evidence,
    threats,
  };
}

// ---------------------------------------------------------------------------
export interface GuardrailInput {
  thesis: string;
  numbersSay: string;
  bullCase: string;
  bearCase: string;
  catalystNote: string;
  entryTrigger: string;
  exitWatchTrigger: string;
  chartReading: string;
  catalysts: Array<{ text: string; anchorMetric?: string | null; sourceUrl?: string | null; sourceDate?: string | null }>;
}

export interface GuardrailOutput {
  thesis: string;
  numbersSay: string;
  bullCase: string;
  bearCase: string;
  catalystNote: string;
  entryTrigger: string;
  exitWatchTrigger: string;
  chartReading: string;
  catalysts: AnalystCatalyst[];
  groundingFacts: string[];
  removedNumbers: string[];
}

const SCORE_VERB_PATTERN = /\b(score|gate|fair\s*value\s*should|should\s*be\s*green|quadrant\s*is\s*wrong|override)\b/i;
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?%?/g;

function collectNumbers(obj: unknown, path = "", out: Array<{ path: string; value: number }> = []): Array<{ path: string; value: number }> {
  if (typeof obj === "number" && Number.isFinite(obj)) {
    out.push({ path, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => collectNumbers(item, `${path}[${idx}]`, out));
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const nextPath = path ? `${path}.${k}` : k;
      collectNumbers(v, nextPath, out);
    }
  }
  return out;
}

function parseNumberToken(token: string): { value: number; isPercent: boolean } | null {
  const isPct = token.endsWith("%");
  const raw = Number(token.replace(/%$/, ""));
  if (!Number.isFinite(raw)) return null;
  return { value: isPct ? raw / 100 : raw, isPercent: isPct };
}

function numberCovered(
  parsed: { value: number; isPercent: boolean },
  numbers: Array<{ path: string; value: number }>,
): string | null {
  for (const n of numbers) {
    if (parsed.isPercent && Math.abs(n.value) > 1.5) continue;
    const absRef = Math.max(Math.abs(n.value), 1);
    const diff = Math.abs(parsed.value - n.value) / absRef;
    if (diff <= THRESHOLDS.analyst_number_tolerance) return n.path;
  }
  return null;
}

function sanitizeTextNumbers(
  text: string | null | undefined,
  numbers: Array<{ path: string; value: number }>,
): { text: string; grounding: string[]; removed: string[] } {
  const safeText = typeof text === "string" ? text : "";
  const sentences = safeText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const kept: string[] = [];
  const grounding = new Set<string>();
  const removed: string[] = [];

  for (const s of sentences) {
    const tokens = s.match(NUMBER_PATTERN) ?? [];
    let ok = true;
    for (const t of tokens) {
      const parsed = parseNumberToken(t);
      if (parsed === null) continue;
      const coveredBy = numberCovered(parsed, numbers);
      if (!coveredBy) {
        ok = false;
        removed.push(t);
      } else {
        grounding.add(coveredBy);
      }
    }
    if (ok) kept.push(s);
  }

  let out = kept.join(" ").trim();
  if (SCORE_VERB_PATTERN.test(out)) {
    out = out.replace(SCORE_VERB_PATTERN, "").trim();
  }

  return { text: out, grounding: Array.from(grounding), removed };
}

function hasAnchor(report: Readonly<Report>, anchorMetric: string | null | undefined): boolean {
  if (!anchorMetric) return false;
  const key = anchorMetric.trim();
  if (!key) return false;
  const probe = (report as unknown as Record<string, unknown>)[key];
  if (typeof probe === "number") return Number.isFinite(probe);
  if (probe && typeof probe === "object") {
    return collectNumbers(probe).length > 0;
  }
  const km = report.key_metrics as unknown as Record<string, unknown>;
  if (key in km && typeof km[key] === "number") return true;
  return false;
}

export function applyAnalystGuardrails(report: Readonly<Report>, input: GuardrailInput): GuardrailOutput {
  const numbers = collectNumbers(report);
  const tradeSetupNumbers = collectNumbers(report.trade_setup ?? {}, "trade_setup");

  const thesis = sanitizeTextNumbers(input.thesis, numbers);
  const numbersSay = sanitizeTextNumbers(input.numbersSay, numbers);
  const bull = sanitizeTextNumbers(input.bullCase, numbers);
  const bear = sanitizeTextNumbers(input.bearCase, numbers);
  const catalystNote = sanitizeTextNumbers(input.catalystNote, numbers);
  const entryTrigger = sanitizeTextNumbers(input.entryTrigger, tradeSetupNumbers);
  const exitWatchTrigger = sanitizeTextNumbers(input.exitWatchTrigger, tradeSetupNumbers);
  const chart = sanitizeTextNumbers(input.chartReading, numbers);

  const catalysts: AnalystCatalyst[] = input.catalysts.map((c) => {
    const anchorMetric = c.anchorMetric ?? null;
    const status: CatalystStatus = hasAnchor(report, anchorMetric) ? "confirmed" : "speculative";
    return {
      text: c.text,
      anchorMetric,
      status,
      sourceUrl: c.sourceUrl ?? null,
      sourceDate: c.sourceDate ?? null,
    };
  });

  const groundingFacts = Array.from(
    new Set([
      ...thesis.grounding,
      ...numbersSay.grounding,
      ...bull.grounding,
      ...bear.grounding,
      ...catalystNote.grounding,
      ...entryTrigger.grounding,
      ...exitWatchTrigger.grounding,
      ...chart.grounding,
    ]),
  ).sort();

  return {
    thesis: thesis.text,
    numbersSay: numbersSay.text,
    bullCase: bull.text,
    bearCase: bear.text,
    catalystNote: catalystNote.text,
    entryTrigger: entryTrigger.text,
    exitWatchTrigger: exitWatchTrigger.text,
    chartReading: chart.text,
    catalysts,
    groundingFacts,
    removedNumbers: [
      ...thesis.removed,
      ...numbersSay.removed,
      ...bull.removed,
      ...bear.removed,
      ...catalystNote.removed,
      ...entryTrigger.removed,
      ...exitWatchTrigger.removed,
      ...chart.removed,
    ],
  };
}
