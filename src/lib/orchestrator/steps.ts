/**
 * Pipeline-Steps. Jeder Step ist eine reine async-Funktion mit klarer Signatur,
 * konsumiert/produziert PipelineState und nutzt den Logger aus events.ts.
 *
 * Reihenfolge (siehe ARCHITECTURE.md §5):
 *   1. fetchBaseData       — Provider parallel, Raw + Facts
 *   2. buildContext        — Fakten + Quellen-Liste in LLM-tauglichen Kontext
 *   3. extractFacts        — LLM normiert key_metrics + identity
 *   4. answerSections      — LLM bewertet Blöcke A–G (parallel, max 2)
 *   5. computeScoreAndGate — deterministisches Scoring/Gate/Category
 *   6. summarize           — LLM Thesis/Bull/Bear/Catalysts
 *   7. persist             — atomic MD/JSON write + DB row + audit
 */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fetchAllFacts } from "@/lib/providers";
import type { ProviderResult, ProviderFact, RawArtifact } from "@/lib/providers/types";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { chatJSON, pickDefaultModel } from "@/lib/llm/ollama";
import { getLLMConfig } from "@/lib/llm/config";
import {
  EXTRACTOR_SYSTEM,
  EXTRACTOR_USER,
  SECTION_SYSTEM,
  SECTION_USER,
  SECTION_BLOCKS,
  SUMMARY_SYSTEM,
  SUMMARY_USER,
  REDTEAM_SYSTEM,
  REDTEAM_USER,
  type BlockId,
} from "@/lib/llm/prompts";
import { computeScore, type IndicatorScore } from "@/lib/scoring/score";
import { computeGate, canHandoffToTradeEngine, type Category } from "@/lib/scoring/gate";
import type { BlockKey } from "@/lib/scoring/weights";
import {
  computePiotroskiF,
  computeMohanramG,
  computeAltmanZ,
  computeBeneishM,
} from "@/lib/research/forensics";
import { classifyBusinessModel } from "@/lib/research/business-model";
import { findPeerBucket } from "@/lib/research/peer-universe";
import { computePeerPercentiles, type PeerPercentiles } from "@/lib/research/peer-cache";
import { detectProviderConflicts, conflictsToRedFlags } from "@/lib/research/conflict-detector";
import { buildResearchContext } from "@/lib/research/context";
import { deriveKeyMetrics, mergeDeterministicMetrics, type DerivedMetricsResult } from "@/lib/research/derived-metrics";
import { validateBlockSources } from "@/lib/research/source-validation";
import { buildMoatAssessment, deriveResearchSignals } from "@/lib/research/signals";
import {
  ReportSchema,
  type Report,
  type KeyMetrics,
  ScoreBreakdownSchema,
  KeyMetricsSchema,
  RedTeamSchema,
  type RedTeam,
} from "@/lib/schemas/report";
import { db, schema } from "@/lib/storage/db";
import { logRun } from "./events";

const DATA_DIR = process.env.DATA_DIR || "./data";

export interface PipelineState {
  runId: string;
  ticker: string;
  runDate: string; // YYYY-MM-DD
  modelExtract: string;
  modelScoring: string;
  modelSummary: string;
  rawDir: string;
  providerResults?: ProviderResult[];
  facts?: ProviderFact[];
  derivedMetrics?: Partial<KeyMetrics>;
  forensicsResult?: {
    piotroski: ReturnType<typeof computePiotroskiF>;
    mohanram: ReturnType<typeof computeMohanramG>;
    altman: ReturnType<typeof computeAltmanZ>;
    beneish: ReturnType<typeof computeBeneishM>;
  };
  businessModelType?: string;
  peerPercentiles?: PeerPercentiles;
  redTeam?: RedTeam | null;
  reverseDcf?: DerivedMetricsResult["reverseDcf"];
  context?: string;
  blockContexts?: Record<BlockId, string>;
  sourceEvidence?: Map<number, string>;
  /** Numerischer Index (1-basiert) → Source-Eintrag */
  sourceMap?: Map<number, { url: string; title?: string; klass: string }>;
  identity?: {
    company_name: string;
    isin: string;
    exchange: string;
    sector: string;
    industry: string;
  };
  keyMetrics?: KeyMetrics;
  blockResults?: Record<BlockId, BlockResult>;
  scoreBreakdown?: Record<BlockId, number>;
  scoreTotal?: number;
  coverage?: number;
  category?: Category;
  confidence?: "low" | "medium" | "high";
  gate?: "Green" | "Yellow" | "Red";
  hardBlockers?: string[];
  redFlags?: string[];
  thesis?: {
    thesis_summary: string;
    bull_case: string[];
    bear_case: string[];
    catalysts: string[];
    open_questions: string[];
    falsification_tests: string[];
  };
  reportId?: string;
}

export interface BlockResult {
  block: BlockId;
  indicators: Array<{ name: string; score: number | null; rationale: string; sourceIdx: number | null }>;
  confidence: "low" | "medium" | "high";
  red_flags: string[];
  hard_blockers: string[];
  invalid_source_refs?: string[];
  moat_rating?: "Wide" | "Narrow" | "Emerging" | "No Moat" | "Negative Trend" | "Unknown" | null;
  moat_evidence?: string[];
  moat_threats?: string[];
}

// -----------------------------------------------------------
// Step 1: fetchBaseData
// -----------------------------------------------------------
export async function stepFetchBaseData(state: PipelineState): Promise<void> {
  fs.mkdirSync(state.rawDir, { recursive: true });
  const log = (msg: string) => logRun(state.runId, "info", `[providers] ${msg}`);
  const results = await fetchAllFacts({
    ticker: state.ticker,
    runDate: state.runDate,
    log,
  });
  // Raw-Artefakte persistieren
  for (const r of results) {
    const dir = path.join(state.rawDir, r.provider);
    fs.mkdirSync(dir, { recursive: true });
    for (const art of r.raw) {
      const filePath = path.join(dir, art.name);
      const data = typeof art.data === "string" ? art.data : JSON.stringify(art.data, null, 2);
      atomicWrite(filePath, data);
    }
  }
  state.providerResults = results;
  state.facts = results.flatMap((r) => r.facts);
  log(`gesamt ${state.facts.length} Fakten aus ${results.filter((r) => r.ok).length} Quellen`);
}

// -----------------------------------------------------------
// Step 2: deriveMetrics
// -----------------------------------------------------------
export async function stepDeriveMetrics(state: PipelineState): Promise<void> {
  const result = deriveKeyMetrics(state.ticker, state.runDate, state.facts ?? []);
  state.derivedMetrics = result.metrics;
  if (result.forensics) {
    state.forensicsResult = result.forensics;
  }
  if (result.reverseDcf) {
    state.reverseDcf = result.reverseDcf;
  }
  if (result.facts.length > 0) {
    state.facts = [...(state.facts ?? []), ...result.facts];
  }
  const bm = classifyBusinessModel(state.facts ?? [], state.ticker);
  state.businessModelType = bm.type;

  // Phase E: Detect provider conflicts
  const conflicts = detectProviderConflicts(state.facts ?? []);
  const conflictFlags = conflictsToRedFlags(conflicts);
  if (conflictFlags.length > 0) {
    logRun(state.runId, "warn", `[conflicts] ${conflicts.length} conflicts detected`);
    // Pre-populate redFlags so stepComputeScoreAndGate can merge them
    state.redFlags = [...(state.redFlags ?? []), ...conflictFlags];
  }

  logRun(
    state.runId,
    "info",
    `[metrics] derived ${Object.keys(result.metrics).length} deterministic key metrics, businessModel=${bm.type}`,
  );
}

// -----------------------------------------------------------
// Step 3: buildContext
// -----------------------------------------------------------
export async function stepBuildContext(state: PipelineState): Promise<void> {
  const facts = state.facts ?? [];
  const blockIds = SECTION_BLOCKS.map((b) => b.id) as BlockKey[];
  const researchContext = buildResearchContext(facts, blockIds);
  state.sourceMap = researchContext.sourceMap;
  state.context = researchContext.context;
  state.blockContexts = researchContext.blockContexts as Record<BlockId, string>;
  state.sourceEvidence = researchContext.sourceEvidence;
  logRun(
    state.runId,
    "info",
    `[context] ${researchContext.sourceMap.size} Quellen, ${facts.length} Fakten, blockweise aufgebaut`,
  );
}

// -----------------------------------------------------------
// Step 3: extractFacts (LLM)
// -----------------------------------------------------------
interface ExtractorOutput {
  company_name: string | null;
  isin: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  key_metrics: Partial<KeyMetrics>;
  facts?: Array<{ field: string; value: unknown; sourceIdx: number }>;
}

function normalizeIsin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(normalized) ? normalized : null;
}

function extractIsinFromFacts(facts: ProviderFact[] | undefined): string | null {
  if (!facts || facts.length === 0) return null;
  const isinPattern = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g;
  for (const fact of facts) {
    if (fact.field.toLowerCase().includes("isin")) {
      const direct = normalizeIsin(typeof fact.value === "string" ? fact.value : String(fact.value ?? ""));
      if (direct) return direct;
    }
    if (typeof fact.value === "string") {
      const m = fact.value.toUpperCase().match(isinPattern);
      if (m?.[0]) return m[0];
      continue;
    }
    try {
      const serialized = JSON.stringify(fact.value).toUpperCase();
      const m = serialized.match(isinPattern);
      if (m?.[0]) return m[0];
    } catch {
      // ignore unserializable values
    }
  }
  return null;
}

export async function stepExtractFacts(state: PipelineState): Promise<void> {
  const { data } = await chatJSON<ExtractorOutput>({
    runId: state.runId,
    step: "extract",
    model: state.modelExtract,
    system: EXTRACTOR_SYSTEM,
    user: EXTRACTOR_USER(state.ticker, state.context ?? ""),
    temperature: 0.1,
    artifactsDir: state.rawDir,
  });
  const extractedIsin = normalizeIsin(data.isin);
  const fallbackIsin = extractIsinFromFacts(state.facts);
  state.identity = {
    company_name: data.company_name ?? "",
    isin: extractedIsin ?? fallbackIsin ?? "",
    exchange: data.exchange ?? "",
    sector: data.sector ?? "",
    industry: data.industry ?? "",
  };
  // Validate KeyMetrics: füllt fehlende Felder mit null
  const km = KeyMetricsSchema.parse({
    revenue_growth_yoy: data.key_metrics?.revenue_growth_yoy ?? null,
    revenue_cagr_3y: data.key_metrics?.revenue_cagr_3y ?? null,
    gross_margin: data.key_metrics?.gross_margin ?? null,
    operating_margin: data.key_metrics?.operating_margin ?? null,
    fcf_margin: data.key_metrics?.fcf_margin ?? null,
    roic: data.key_metrics?.roic ?? null,
    rule_of_40: data.key_metrics?.rule_of_40 ?? null,
    rule_of_x: data.key_metrics?.rule_of_x ?? null,
    share_count_growth_yoy: data.key_metrics?.share_count_growth_yoy ?? null,
    sbc_to_revenue: data.key_metrics?.sbc_to_revenue ?? null,
    net_debt_to_ebitda: data.key_metrics?.net_debt_to_ebitda ?? null,
    beta: data.key_metrics?.beta ?? null,
    ntm_pe: data.key_metrics?.ntm_pe ?? null,
    ev_sales: data.key_metrics?.ev_sales ?? null,
    ev_gross_profit: data.key_metrics?.ev_gross_profit ?? null,
    peg: data.key_metrics?.peg ?? null,
  });
  state.keyMetrics = mergeDeterministicMetrics(km, state.derivedMetrics);
}

// -----------------------------------------------------------
// Step 4: answerSections (LLM, parallel max 2)
// -----------------------------------------------------------
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function clampScore(score: unknown): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.max(0, Math.min(10, score));
}

function sanitizeBlockResult(block: (typeof SECTION_BLOCKS)[number], data: Partial<BlockResult>): BlockResult {
  return {
    block: block.id,
    indicators: Array.isArray(data.indicators)
      ? data.indicators.map((i) => ({
          name: String(i.name ?? ""),
          score: clampScore(i.score),
          rationale: String(i.rationale ?? ""),
          sourceIdx: typeof i.sourceIdx === "number" && Number.isInteger(i.sourceIdx) ? i.sourceIdx : null,
        }))
      : [],
    confidence: data.confidence === "low" || data.confidence === "high" ? data.confidence : "medium",
    red_flags: Array.isArray(data.red_flags) ? data.red_flags.map(String) : [],
    hard_blockers: Array.isArray(data.hard_blockers) ? data.hard_blockers.map(String) : [],
    moat_rating: data.moat_rating ?? null,
    moat_evidence: Array.isArray(data.moat_evidence) ? data.moat_evidence.map(String) : [],
    moat_threats: Array.isArray(data.moat_threats) ? data.moat_threats.map(String) : [],
  };
}

export async function stepAnswerSections(state: PipelineState): Promise<void> {
  const provider = getLLMConfig().provider;
  // Nur DeepSeek stabil mit hoher Parallelität; Ollama/OpenRouter single-flight.
  const sectionConcurrency = provider === "deepseek" ? 7 : 1;
  const blockResults = await runWithConcurrency(SECTION_BLOCKS as unknown as Array<typeof SECTION_BLOCKS[number]>, sectionConcurrency, async (block) => {
    const { data } = await chatJSON<BlockResult>({
      runId: state.runId,
      step: `section_${block.id}`,
      model: state.modelScoring,
      system: SECTION_SYSTEM,
      user: SECTION_USER(
        { id: block.id, label: block.label },
        state.ticker,
        state.blockContexts?.[block.id] ?? state.context ?? "",
      ),
      temperature: 0.2,
      artifactsDir: state.rawDir,
    });
    const sanitized = sanitizeBlockResult(block, data);
    const checked = validateBlockSources(sanitized, state.sourceEvidence ?? new Map());
    if (checked.invalid_source_refs.length > 0) {
      logRun(
        state.runId,
        "warn",
        `[sources] ${block.id}: ${checked.invalid_source_refs.length} unsichere Referenzen entfernt`,
      );
    }
    return checked;
  });
  const map = {} as Record<BlockId, BlockResult>;
  for (const r of blockResults) map[r.block] = r;
  state.blockResults = map;
}

// -----------------------------------------------------------
// Step 5: computeScoreAndGate (deterministic)
// -----------------------------------------------------------
export async function stepComputeScoreAndGate(state: PipelineState): Promise<void> {
  const blocks = {} as Record<BlockKey, IndicatorScore[]>;
  const allHardBlockers: string[] = [];
  const allRedFlags: string[] = [];
  const confidences: string[] = [];

  for (const b of SECTION_BLOCKS) {
    const r = state.blockResults?.[b.id];
    blocks[b.id] = (r?.indicators ?? []).map((i) => ({
      key: i.name,
      value: typeof i.score === "number" ? i.score : null,
      rationale: i.rationale,
      sourceIdx: i.sourceIdx != null ? [i.sourceIdx] : undefined,
    }));
    if (r?.hard_blockers) allHardBlockers.push(...r.hard_blockers);
    if (r?.red_flags) allRedFlags.push(...r.red_flags);
    if (r?.confidence) confidences.push(r.confidence);
  }

  const scored = computeScore(blocks);
  state.scoreTotal = scored.total;
  state.coverage = scored.coverage;
  state.scoreBreakdown = Object.fromEntries(
    (Object.keys(scored.blocks) as BlockKey[]).map((k) => [k, Math.round(scored.blocks[k].weighted * 100) / 100]),
  ) as Record<BlockId, number>;
  state.hardBlockers = Array.from(new Set(allHardBlockers));

  // Confidence aggregieren: Mehrheit / lowest-wins
  const lowCount = confidences.filter((c) => c === "low").length;
  const highCount = confidences.filter((c) => c === "high").length;
  state.confidence =
    confidences.length === 0
      ? "low"
      : lowCount > highCount
        ? "low"
        : highCount >= confidences.length / 2
          ? "high"
          : "medium";

  // Category uses research.md category traps plus block-specific signals.
  const signals = deriveResearchSignals({
    scoreTotal: state.scoreTotal,
    coverage: state.coverage,
    confidence: state.confidence,
    keyMetrics: state.keyMetrics,
    scoreBreakdown: state.scoreBreakdown,
    hardBlockers: state.hardBlockers,
  });
  state.category = signals.category;
  state.hardBlockers = signals.hardBlockers;
  state.redFlags = Array.from(new Set([...allRedFlags, ...signals.redFlags]));

  state.gate = computeGate({
    scoreTotal: state.scoreTotal,
    coverage: state.coverage,
    confidence: state.confidence,
    category: state.category,
    hardBlockers: state.hardBlockers,
  });

  logRun(
    state.runId,
    "info",
    `[score] total=${state.scoreTotal} gate=${state.gate} cat=${state.category} cov=${state.coverage.toFixed(2)}`,
  );
}

// -----------------------------------------------------------
// Step 6: summarize (LLM)
// -----------------------------------------------------------
export async function stepSummarize(state: PipelineState): Promise<void> {
  const { data } = await chatJSON<NonNullable<PipelineState["thesis"]>>({
    runId: state.runId,
    step: "summary",
    model: state.modelSummary,
    system: SUMMARY_SYSTEM,
    user: SUMMARY_USER(state.ticker, state.category ?? "Transitional", state.scoreTotal ?? 0, state.context ?? ""),
    temperature: 0.4,
    artifactsDir: state.rawDir,
  });
  state.thesis = {
    thesis_summary: data.thesis_summary ?? "",
    bull_case: data.bull_case ?? [],
    bear_case: data.bear_case ?? [],
    catalysts: data.catalysts ?? [],
    open_questions: data.open_questions ?? [],
    falsification_tests: data.falsification_tests ?? [],
  };
}

// -----------------------------------------------------------
// Step 6b: Red-Team (LLM, conditional on score >= 75)
// -----------------------------------------------------------
const REDTEAM_SCORE_THRESHOLD = 75;

export async function stepRedTeam(state: PipelineState): Promise<void> {
  // Only run when score is high enough to warrant adversarial review
  if ((state.scoreTotal ?? 0) < REDTEAM_SCORE_THRESHOLD) {
    logRun(state.runId, "info", `[redteam] skipped (score=${state.scoreTotal} < ${REDTEAM_SCORE_THRESHOLD})`);
    state.redTeam = null;
    return;
  }

  const bullCase = state.thesis?.bull_case ?? [];
  if (bullCase.length === 0) {
    logRun(state.runId, "info", "[redteam] skipped (no bull case)");
    state.redTeam = null;
    return;
  }

  // Build a compact metrics summary for the prompt
  const km = state.keyMetrics;
  const keyMetricsSummary = km
    ? [
        km.revenue_growth_yoy != null ? `Umsatzwachstum YoY: ${(km.revenue_growth_yoy * 100).toFixed(1)}%` : null,
        km.gross_margin != null ? `Bruttomarge: ${(km.gross_margin * 100).toFixed(1)}%` : null,
        km.fcf_margin != null ? `FCF-Marge: ${(km.fcf_margin * 100).toFixed(1)}%` : null,
        km.rule_of_40 != null ? `Rule of 40: ${km.rule_of_40.toFixed(0)}` : null,
        km.net_debt_to_ebitda != null ? `Net Debt/EBITDA: ${km.net_debt_to_ebitda.toFixed(1)}x` : null,
        km.ev_sales != null ? `EV/Sales: ${km.ev_sales.toFixed(1)}x` : null,
        km.piotroski_f != null ? `Piotroski-F: ${km.piotroski_f}/9` : null,
        km.altman_z != null ? `Altman-Z: ${km.altman_z.toFixed(2)}` : null,
      ].filter(Boolean).join(", ")
    : "";

  try {
    const { data } = await chatJSON<RedTeam>({
      runId: state.runId,
      step: "redteam",
      model: state.modelSummary,
      system: REDTEAM_SYSTEM,
      user: REDTEAM_USER(
        state.ticker,
        state.category ?? "Transitional",
        state.scoreTotal ?? 0,
        bullCase,
        keyMetricsSummary,
        state.context ?? "",
      ),
      temperature: 0.3,
      artifactsDir: state.rawDir,
    });
    state.redTeam = RedTeamSchema.parse(data);
    logRun(state.runId, "info", `[redteam] ${state.redTeam.bear_arguments.length} bear arguments`);
  } catch (err) {
    logRun(state.runId, "warn", `[redteam] failed: ${String(err)}`);
    state.redTeam = null;
  }
}

// -----------------------------------------------------------
// Step 7a: computePeerPercentiles (deterministic, no LLM)
// -----------------------------------------------------------
export async function stepComputePeerPercentiles(state: PipelineState): Promise<void> {
  if (!state.keyMetrics || !state.businessModelType) return;

  const revenueTtm = state.keyMetrics.revenue_growth_yoy !== null ? undefined : undefined; // revenue_ttm not in KeyMetrics
  const bucket = findPeerBucket(state.businessModelType, revenueTtm ?? null);
  if (!bucket) {
    logRun(state.runId, "info", `[peer] no bucket found for businessModel=${state.businessModelType}`);
    return;
  }

  const result = computePeerPercentiles(state.keyMetrics, bucket);
  state.peerPercentiles = result;

  // Persist to DB
  db.insert(schema.peerMetrics).values({
    reportId: state.reportId ?? "pending",
    ticker: state.ticker,
    bucketId: bucket.bucketId,
    computedAt: Date.now(),
    percentilesJson: JSON.stringify(result.percentiles),
    vsMedianJson: JSON.stringify(result.vsMedian),
    computedKeys: JSON.stringify(result.computed),
  }).run();

  logRun(
    state.runId,
    "info",
    `[peer] bucket=${bucket.bucketId} computed ${result.computed.length} percentiles`,
  );
}

// -----------------------------------------------------------
// Step 8: persist
// -----------------------------------------------------------
function ulid(): string {
  // einfacher ULID-ähnlicher String, ausreichend für lokales SQLite-PK
  return Date.now().toString(36) + crypto.randomBytes(8).toString("hex");
}

export async function stepPersist(state: PipelineState): Promise<{ reportId: string; reportMdPath: string; reportJsonPath: string }> {
  const reportId = ulid();
  state.reportId = reportId;

  // Source list für Report
  const sourceList = Array.from(state.sourceMap?.entries() ?? []).map(([idx, s]) => ({
    idx,
    url: s.url,
    title: s.title,
    class: (["A", "A-", "B", "B-", "C", "D", "E"].includes(s.klass) ? s.klass : "C") as
      | "A"
      | "A-"
      | "B"
      | "B-"
      | "C"
      | "D"
      | "E",
  }));

  const breakdown = ScoreBreakdownSchema.parse(state.scoreBreakdown);

  const blockAudits = SECTION_BLOCKS.map((b) => {
    const r = state.blockResults?.[b.id];
    return {
      block: b.id,
      indicators: (r?.indicators ?? []).map((i) => ({
        name: i.name,
        score: typeof i.score === "number" ? i.score : null,
        rationale: i.rationale ?? "",
        sourceIdx: i.sourceIdx != null ? [i.sourceIdx] : [],
      })),
      confidence: r?.confidence ?? "medium",
      hard_blockers: r?.hard_blockers ?? [],
      red_flags: r?.red_flags ?? [],
    };
  });

  const reportData: Report = ReportSchema.parse({
    ticker: state.ticker,
    company_name: state.identity?.company_name ?? "",
    isin: state.identity?.isin ?? "",
    exchange: state.identity?.exchange ?? "",
    sector: state.identity?.sector ?? "",
    industry: state.identity?.industry ?? "",
    research_date: state.runDate,
    category: state.category,
    growth_research_score: state.scoreTotal,
    gate: state.gate,
    confidence: state.confidence,
    thesis_summary: state.thesis?.thesis_summary ?? "",
    bull_case: state.thesis?.bull_case ?? [],
    bear_case: state.thesis?.bear_case ?? [],
    key_metrics: state.keyMetrics,
    score_breakdown: breakdown,
    block_audits: blockAudits,
    moat_assessment: buildMoatAssessment(state.blockResults?.quality_moat, state.sourceMap ?? new Map()),
    catalysts: state.thesis?.catalysts ?? [],
    red_flags: state.redFlags ?? [],
    hard_blockers: state.hardBlockers ?? [],
    open_questions: state.thesis?.open_questions ?? [],
    falsification_tests: state.thesis?.falsification_tests ?? [],
    source_list: sourceList,
    handoff_to_trade_engine: canHandoffToTradeEngine({
      scoreTotal: state.scoreTotal!,
      coverage: state.coverage!,
      confidence: state.confidence!,
      category: state.category!,
      hardBlockers: state.hardBlockers!,
    }),
    // Phase A: forensics & business model
    business_model_type: state.businessModelType ?? "",
    piotroski_components: state.forensicsResult?.piotroski?.components ?? {},
    mohanram_components: state.forensicsResult?.mohanram?.components ?? {},
    altman_classification: state.forensicsResult?.altman?.classification ?? null,
    beneish_manipulation_probability: state.forensicsResult?.beneish?.manipulationProbability ?? null,

    // Phase C: Red-Team
    red_team: state.redTeam ?? null,

    // Phase E: Reverse-DCF
    reverse_dcf: state.reverseDcf
      ? {
          implied_growth_rate: state.reverseDcf.impliedGrowthRate ?? null,
          classification: state.reverseDcf.classification ?? "unknown",
        }
      : null,
  });

  const reportsDir = path.join(DATA_DIR, "reports", state.ticker.toUpperCase());
  fs.mkdirSync(reportsDir, { recursive: true });
  const stem = `${state.runDate}_${reportId}`;
  const reportJsonPath = path.join(reportsDir, `${stem}.json`);
  const reportMdPath = path.join(reportsDir, `${stem}.md`);

  atomicWrite(reportJsonPath, JSON.stringify(reportData, null, 2));
  atomicWrite(reportMdPath, renderMarkdown(reportData));

  // DB-Eintrag
  db.insert(schema.reports)
    .values({
      id: reportId,
      ticker: state.ticker.toUpperCase(),
      exchange: reportData.exchange,
      companyName: reportData.company_name,
      researchDate: state.runDate,
      runId: state.runId,
      category: reportData.category,
      gate: reportData.gate,
      scoreTotal: Math.round(reportData.growth_research_score),
      scoreBreakdown: JSON.stringify(reportData.score_breakdown),
      confidence: reportData.confidence,
      reportMdPath,
      reportJsonPath,
      rawDir: state.rawDir,
      createdAt: Date.now(),
      modelExtract: state.modelExtract,
      modelScoring: state.modelScoring,
      modelSummary: state.modelSummary,
      hardBlockers: JSON.stringify(reportData.hard_blockers),
      handoffToTradeEngine: reportData.handoff_to_trade_engine ? 1 : 0,
    })
    .run();

  // Source-Tabelle füllen
  if (sourceList.length > 0) {
    db.insert(schema.sources)
      .values(
        sourceList.map((s) => ({
          reportId,
          url: s.url,
          title: s.title,
          klass: s.class,
          fetchedAt: Date.now(),
        })),
      )
      .run();
  }

  logRun(state.runId, "info", `[persist] reportId=${reportId} json=${reportJsonPath}`);
  return { reportId, reportMdPath, reportJsonPath };
}

function renderMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push(`# ${r.ticker} · ${r.company_name}`);
  lines.push("");
  lines.push(`**Datum:** ${r.research_date}  ·  **Gate:** ${r.gate}  ·  **Score:** ${r.growth_research_score}/100  ·  **Kategorie:** ${r.category}  ·  **Confidence:** ${r.confidence}`);
  if (r.isin) {
    lines.push(`**ISIN:** ${r.isin}`);
  }
  lines.push("");
  lines.push("## These");
  lines.push(r.thesis_summary || "_n/a_");
  lines.push("");
  lines.push("### Bull Case");
  r.bull_case.forEach((b) => lines.push(`- ${b}`));
  lines.push("");
  lines.push("### Bear Case");
  r.bear_case.forEach((b) => lines.push(`- ${b}`));
  if (r.hard_blockers.length > 0) {
    lines.push("");
    lines.push("### Hard Blockers");
    r.hard_blockers.forEach((b) => lines.push(`- ⛔ ${b}`));
  }
  if (r.red_flags.length > 0) {
    lines.push("");
    lines.push("### Red Flags");
    r.red_flags.forEach((b) => lines.push(`- ${b}`));
  }
  if (r.moat_assessment.rating !== "Unknown" || r.moat_assessment.evidence.length > 0) {
    lines.push("");
    lines.push("### Moat");
    lines.push(`- Rating: ${r.moat_assessment.rating}`);
    r.moat_assessment.evidence.forEach((e) => lines.push(`- Evidence: ${e}`));
    r.moat_assessment.threats.forEach((t) => lines.push(`- Threat: ${t}`));
  }
  lines.push("");
  lines.push("## Score-Breakdown");
  for (const [k, v] of Object.entries(r.score_breakdown)) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push("");
  lines.push("## Quellen");
  for (const s of r.source_list) {
    lines.push(`- [${s.idx}] (${s.class}) ${s.title ?? s.url} — ${s.url}`);
  }
  return lines.join("\n");
}

export async function resolveModels(): Promise<{ extract: string; scoring: string; summary: string }> {
  const { getLLMConfig } = await import("@/lib/llm/config");
  const cfg = getLLMConfig();
  if (cfg.provider === "deepseek") {
    const m = cfg.deepseekModel || "deepseek-chat";
    return { extract: m, scoring: m, summary: m };
  }
  if (cfg.provider === "openrouter") {
    const m = cfg.openrouterModel || "openrouter/free";
    return { extract: m, scoring: m, summary: m };
  }
  const m = await pickDefaultModel();
  return { extract: m, scoring: m, summary: m };
}
