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
import { execSync } from "node:child_process";
import { fetchAllFacts } from "@/lib/providers";
import { gatherCompanyDatasetDetailed, gatherMarketContextDetailed } from "@/lib/providers/collect";
import type {
  CapabilityFetchDiagnostic,
  ProviderResult,
  ProviderFact,
} from "@/lib/providers/types";
import { atomicWrite } from "@/lib/utils/atomic-write";
import { chatJSON, pickDefaultModel } from "@/lib/llm/ollama";
import {
  SECTION_BLOCKS,
  type BlockId,
} from "@/lib/llm/prompts";
import { computeScore, type IndicatorScore } from "@/lib/scoring/score";
import { computeGate, canHandoffToTradeEngine, type Category } from "@/lib/scoring/gate";
import { BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";
import { scoreCompany, type LensScoreResult } from "@/lib/scoring/engine";
import { evaluateCriticalCoverage } from "@/lib/scoring/critical-metrics";
import { normalizeDataset, type NormalizationResult } from "@/lib/research/normalization";
import { computeTechnicals, type TechnicalIndicators } from "@/lib/research/technicals";
import { classifyMarketRegime, type RegimeResult } from "@/lib/research/regime";
import { buildTimingOutput, type TimingOutput } from "@/lib/scoring/timing";
import { computeEstimatesSignals } from "@/lib/research/estimates-signals";
import { computeOwnershipSignals } from "@/lib/research/ownership-signals";
import { interpretReport, interpretAxes, type AnalystBlock } from "@/lib/analyst/interpret";
import { buildAnalystEvidence } from "@/lib/analyst/evidence";
import {
  computePiotroskiF,
  computeMohanramG,
  computeAltmanZ,
  computeBeneishM,
} from "@/lib/research/forensics";
import { classifyBusinessModel } from "@/lib/research/business-model";
import { classifyBusinessModelProfile, type BusinessModelProfile } from "@/lib/research/business-model-classifier";
import { buildMetricApplicability } from "@/lib/research/metric-applicability";
import {
  buildQualitativeThesis,
  buildPlausibilityFlags,
  determineAnalysisDomain,
  type AnalysisDomain,
  type PlausibilityFlag,
  type QualitativeThesis,
} from "@/lib/research/analysis-domain";
import { findPeerBucket } from "@/lib/research/peer-universe";
import { computePeerPercentiles, type PeerPercentiles } from "@/lib/research/peer-cache";
import { deriveConfidenceScore } from "@/lib/research/combo-signals";
import { detectProviderConflicts, conflictsToRedFlags } from "@/lib/research/conflict-detector";
import { buildResearchContext } from "@/lib/research/context";
import { deriveKeyMetrics, deriveMetricsFromDataset, mergeDeterministicMetrics, type DerivedMetricsResult } from "@/lib/research/derived-metrics";
import { THRESHOLDS } from "@/lib/research/thresholds";
import { buildMoatAssessment } from "@/lib/research/signals";
import { type RedFlagCluster } from "@/lib/research/redflag-cluster";
import { buildDebtBreakdown, type DebtBreakdown } from "@/lib/research/debt-breakdown";
import { applyConfidenceCaps, type DataCoverage } from "@/lib/scoring/confidence-cap";
import { computeFairValue, type FairValueResult, type FairValueReverseDcfCheck } from "@/lib/research/fair-value";
import { buildVerdict, sanitizeVerdictDetail, type VerdictResult } from "@/lib/research/verdict";
import { computeTradeSetup, type TradeSetup } from "@/lib/research/trade-setup";
import { VERDICT_DETAIL_SYSTEM, VERDICT_DETAIL_USER } from "@/lib/llm/prompts";
import { persistScoreHistoryEntry } from "@/lib/research/score-history";
import { fetchAndComputeMarketHealth, type MarketHealth } from "@/lib/market/health";
import { ASSUMPTIONS_VERSION, DCF_ASSUMPTIONS, MODEL_ASSUMPTIONS } from "@/lib/research/assumptions";
import {
  ReportSchema,
  type Report,
  type KeyMetrics,
  ScoreBreakdownSchema,
  KeyMetricsSchema,
} from "@/lib/schemas/report";
import type { CompanyDataset, MarketContext } from "@/lib/schemas/dataset";
import { db, schema } from "@/lib/storage/db";
import { logRun } from "./events";
import { normalizeIsin } from "@/lib/providers/symbol-resolution";
import { sanitizeUrlForAudit } from "@/lib/utils/secrets";

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
  fetchDiagnostics?: CapabilityFetchDiagnostic[];
  runIncompleteDueToTechnicalFailure?: boolean;
  retryRecommended?: boolean;
  facts?: ProviderFact[];
  companyDataset?: CompanyDataset;
  normalizedDataset?: CompanyDataset;
  normalization?: NormalizationResult;
  marketContext?: MarketContext;
  marketHealth?: MarketHealth;
  technicals?: TechnicalIndicators;
  regimeResult?: RegimeResult;
  timing?: TimingOutput;
  analyst?: AnalystBlock | null;
  lensResults?: Record<"quality_compounder" | "emerging_winner" | "quality_garp", LensScoreResult>;
  derivedMetrics?: Partial<KeyMetrics>;
  forensicsResult?: {
    piotroski: ReturnType<typeof computePiotroskiF>;
    mohanram: ReturnType<typeof computeMohanramG>;
    altman: ReturnType<typeof computeAltmanZ>;
    beneish: ReturnType<typeof computeBeneishM>;
  };
  businessModelType?: string;
  businessModelProfile?: BusinessModelProfile;
  metricApplicability?: Record<string, unknown>;
  analysisDomain?: AnalysisDomain;
  analysisDomainReasons?: string[];
  qualitativeThesis?: QualitativeThesis | null;
  plausibilityFlags?: PlausibilityFlag[];
  peerPercentiles?: PeerPercentiles;
  debtBreakdown?: DebtBreakdown;
  dataQuality?: DataCoverage;
  auditEvents?: Array<{ level: "info" | "warn" | "error"; type: string; block?: string; details?: unknown }>;
  invalidSourceRefs?: string[];
  redFlagsClustered?: RedFlagCluster[];
  effectiveModels?: {
    extract?: string;
    scoring: Partial<Record<BlockId, string>>;
    summary?: string;
    redTeam?: string;
    verdictDetail?: string;
  };
  llmCalls?: Array<{
    step: string;
    provider: string;
    requestedModel: string;
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    rateLimit?: Record<string, string | null | undefined>;
    systemFingerprint?: string | null;
  }>;
  reverseDcf?: DerivedMetricsResult["reverseDcf"];
  fairValue?: FairValueResult | null;
  tradeSetup?: TradeSetup;
  verdict?: VerdictResult & { detail: string } | null;
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
  scoreTotal?: number | null;
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
  indicators: Array<{
    name: string;
    score: number | null;
    rationale: string;
    reason?: string;
    inputs?: string[];
    sourceIdx: number | null;
    scoreType?: "deterministic" | "llm_judgment" | "hybrid";
    scoreValid?: boolean;
    rationaleValid?: boolean;
    sourceSupportStatus?: "supported" | "unsupported" | "not_checked" | "internal_metric";
    metricRefs?: string[];
    missingMetricRefs?: string[];
    dataStatus?: "valid" | "missing_required_data" | "not_applicable" | "unsupported_claim" | "conflicting_data" | "stale_data";
    invalidSourceRefs?: string[];
  }>;
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
  state.fetchDiagnostics = state.fetchDiagnostics ?? [];

  try {
    const detailed = await gatherCompanyDatasetDetailed(state.ticker, {
      asOf: state.runDate,
      runId: state.runId,
    });
    state.companyDataset = detailed.dataset;
    state.fetchDiagnostics.push(...detailed.diagnostics.capabilities);
    if (detailed.diagnostics.incompleteDueToTechnicalFailure) {
      state.runIncompleteDueToTechnicalFailure = true;
      state.retryRecommended = detailed.diagnostics.retryRecommended;
    }
  } catch (err) {
    log(`[providers] dataset gather failed: ${String(err)}`);
  }

  try {
    const detailed = await gatherMarketContextDetailed({
      asOf: state.runDate,
      runId: state.runId,
    });
    state.marketContext = detailed.dataset;
    state.fetchDiagnostics.push(...detailed.diagnostics.capabilities);
    if (detailed.diagnostics.incompleteDueToTechnicalFailure) {
      state.runIncompleteDueToTechnicalFailure = true;
      state.retryRecommended = detailed.diagnostics.retryRecommended;
    }
  } catch (err) {
    log(`[providers] market context gather failed: ${String(err)}`);
  }

  if (state.runIncompleteDueToTechnicalFailure) {
    const failedCaps = (state.fetchDiagnostics ?? [])
      .filter((d) => d.status === "fetch_failed" || d.status === "rate_limited")
      .map((d) => `${d.capability}:${d.status}`)
      .join(", ");
    logRun(
      state.runId,
      "warn",
      `[providers] run marked incomplete due to technical fetch failures (${failedCaps || "unknown"}); retry recommended`,
    );
  }

  log(`gesamt ${state.facts.length} Fakten aus ${results.filter((r) => r.ok).length} Quellen`);
}

// -----------------------------------------------------------
// Step 1b: normalizeDataset (deterministic, no LLM)
// -----------------------------------------------------------
export async function stepNormalizeDataset(state: PipelineState): Promise<void> {
  if (!state.companyDataset) return;
  const normalization = normalizeDataset(state.companyDataset);
  state.normalization = normalization;
  state.normalizedDataset = normalization.dataset;
  logRun(
    state.runId,
    "info",
    `[normalize] reportingCurrency=${normalization.reportingCurrency} fx=${normalization.fxRateUsed}`,
  );
}

// -----------------------------------------------------------
// Step 2: deriveMetrics
// -----------------------------------------------------------
export async function stepDeriveMetrics(state: PipelineState): Promise<void> {
  state.auditEvents = state.auditEvents ?? [];
  state.invalidSourceRefs = state.invalidSourceRefs ?? [];
  state.llmCalls = state.llmCalls ?? [];
  state.effectiveModels = state.effectiveModels ?? { scoring: {} };

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
  state.businessModelProfile = classifyBusinessModelProfile(state.facts ?? []);
  state.debtBreakdown = buildDebtBreakdown(state.facts ?? []);
  if (state.debtBreakdown?.net_debt_interest_bearing != null) {
    const ebitdaFact = (state.facts ?? [])
      .filter((f) => f.field === "ebitda")
      .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
    const ebitda =
      typeof ebitdaFact?.value === "number"
        ? ebitdaFact.value
        : typeof ebitdaFact?.value === "string"
          ? Number(ebitdaFact.value.replace(/,/g, ""))
          : null;
    if (typeof ebitda === "number" && Number.isFinite(ebitda) && ebitda > 0) {
      const netDebtToEbitda = state.debtBreakdown.net_debt_interest_bearing / ebitda;
      state.derivedMetrics = {
        ...(state.derivedMetrics ?? {}),
        net_debt_to_ebitda: Number(netDebtToEbitda.toFixed(6)),
      };
    }
  }

  // Phase E: Detect provider conflicts
  const conflicts = detectProviderConflicts(state.facts ?? []);
  const actionableConflicts = conflicts.filter((c) => c.relativeSpread > THRESHOLDS.provider_conflict_tolerance);
  const conflictFlags = conflictsToRedFlags(actionableConflicts);
  for (const conflict of actionableConflicts) {
    state.facts = [
      ...(state.facts ?? []),
      {
        field: conflict.field,
        value: conflict.winner.value,
        url: `derived:provider_conflict_resolver:${conflict.winner.provider}`,
        title: "Resolved by provider precedence",
        asOf: `${state.runDate}T23:59:59Z`,
        klass: "A-",
      },
    ];
  }
  if (conflictFlags.length > 0) {
    logRun(state.runId, "warn", `[conflicts] ${actionableConflicts.length} conflicts detected`);
    // Pre-populate redFlags so stepComputeScoreAndGate can merge them
    state.redFlags = [...(state.redFlags ?? []), ...conflictFlags];
    state.auditEvents.push({
      level: "warn",
      type: "provider_conflict",
      details: actionableConflicts.map((c) => ({
        field: c.field,
        severity: c.severity,
        values: c.values,
        winner: c.winner,
      })),
    });
    state.dataQuality = state.dataQuality ?? {
      keyMetricCoverage: 0,
      criticalMetricCoverage: 0,
      indicatorScoreCoverage: 0,
      sourceSupportCoverage: 0,
      providerCrossCheckCoverage: 0,
      applicabilityAdjustedCoverage: 0,
      missingCriticalMetrics: [],
      notApplicableMetrics: [],
      unsupportedClaims: [],
      conflictingMetrics: [],
    };
    state.dataQuality.conflictingMetrics = [
      ...(state.dataQuality.conflictingMetrics ?? []),
      ...actionableConflicts.map((c) => {
        const values = c.values.map((v) => `${v.provider}=${v.value}`).join(" | ");
        return `${c.field}: ${values}; winner=${c.winner.provider}`;
      }),
    ];
  }

  logRun(
    state.runId,
    "info",
    `[metrics] derived ${Object.keys(result.metrics).length} deterministic key metrics, businessModel=${bm.type}`,
  );

  // Enrich derivedMetrics with dataset-based fields (short interest, PEG fallback from normalised dataset)
  const ds = state.normalizedDataset ?? state.companyDataset;
  if (ds) {
    const dm = deriveMetricsFromDataset(ds);
    const patch: Partial<KeyMetrics> = {};
    if (dm.shortInterestPctFloat !== null) patch.short_interest_pct_float = dm.shortInterestPctFloat;
    if (dm.daysToCover !== null) patch.days_to_cover = dm.daysToCover;
    if (dm.evEbitToGrowth !== null) patch.ev_ebit_to_growth = dm.evEbitToGrowth;
    if (dm.evSalesToGrowth !== null) patch.ev_sales_to_growth = dm.evSalesToGrowth;
    if (dm.pegFallbackLevel !== null) patch.peg_fallback_level = dm.pegFallbackLevel;
    if (dm.evEbit !== null) patch.ev_ebit = dm.evEbit;
    // GARP Core-Upgrades
    if (dm.evFcf !== null) patch.ev_fcf = dm.evFcf;
    if (dm.fcfPeg !== null) patch.fcf_peg = dm.fcfPeg;
    if (dm.forwardFcfCagr !== null) patch.forward_fcf_cagr = dm.forwardFcfCagr;
    if (dm.forwardFcfCagrSource !== null) patch.forward_fcf_cagr_source = dm.forwardFcfCagrSource;
    if (dm.capexOcfRatio !== null) patch.capex_ocf_ratio = dm.capexOcfRatio;
    if (dm.reverseDcfAsymmetry !== null) patch.reverse_dcf_asymmetry = dm.reverseDcfAsymmetry;
    if (Object.keys(patch).length > 0) {
      state.derivedMetrics = { ...(state.derivedMetrics ?? {}), ...patch };
    }
  }
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
  const dataset = state.normalizedDataset ?? state.companyDataset;
  const extractedIsin = normalizeIsin(dataset?.identity.isin ?? null);
  const fallbackIsin = extractIsinFromFacts(state.facts);
  state.identity = {
    company_name: dataset?.identity.name ?? "",
    isin: extractedIsin ?? fallbackIsin ?? "",
    exchange: dataset?.identity.exchange ?? "",
    sector: dataset?.identity.sector ?? "",
    industry: dataset?.identity.industry ?? "",
  };
  const km = KeyMetricsSchema.parse({});
  state.keyMetrics = mergeDeterministicMetrics(km, state.derivedMetrics);
  state.metricApplicability = state.businessModelProfile
    ? buildMetricApplicability(state.keyMetrics, state.businessModelProfile)
    : {};
  const domainDecision = determineAnalysisDomain({
    profile: state.businessModelProfile,
    keyMetrics: state.keyMetrics,
    facts: state.facts ?? [],
    criticalCoverage: state.dataQuality?.criticalMetricCoverage ?? 1,
    runIncompleteDueToTechnicalFailure: state.runIncompleteDueToTechnicalFailure ?? false,
  });
  state.analysisDomain = domainDecision.domain;
  state.analysisDomainReasons = domainDecision.reasons;
  state.plausibilityFlags = buildPlausibilityFlags(state.keyMetrics, state.facts ?? []);
  logRun(state.runId, "info", "[extract] deterministic identity + key metrics hydrated from dataset/derived metrics");
}

// -----------------------------------------------------------
// Step 4: answerSections
// -----------------------------------------------------------
export async function stepAnswerSections(state: PipelineState): Promise<void> {
  const dataset = state.normalizedDataset ?? state.companyDataset;
  if (!dataset) {
    state.blockResults = {} as Record<BlockId, BlockResult>;
    logRun(state.runId, "warn", "[sections] no CompanyDataset available for deterministic scoring");
    return;
  }

  const quality = scoreCompany(dataset, "quality_compounder", state.marketContext);
  const emerging = scoreCompany(dataset, "emerging_winner", state.marketContext);
  const garp = scoreCompany(dataset, "quality_garp", state.marketContext);
  state.lensResults = {
    quality_compounder: quality,
    emerging_winner: emerging,
    quality_garp: garp,
  };

  const active = quality;
  const map = {} as Record<BlockId, BlockResult>;
  for (const block of SECTION_BLOCKS) {
    const indicators = active.indicatorDetails[block.id] ?? [];
    map[block.id] = {
      block: block.id,
      indicators: indicators.map((i) => ({
        name: i.key,
        score: i.value,
        rationale: i.reason,
        sourceIdx: null,
        scoreType: "deterministic",
        scoreValid: typeof i.value === "number",
        rationaleValid: true,
        sourceSupportStatus: "internal_metric",
        metricRefs: i.inputs,
        missingMetricRefs: [],
        dataStatus: typeof i.value === "number" ? "valid" : "missing_required_data",
        invalidSourceRefs: [],
        reason: i.reason,
        inputs: i.inputs,
      })),
      confidence: active.coverage >= THRESHOLDS.coverage_floor ? "high" : "medium",
      red_flags: [],
      hard_blockers: [],
      moat_rating: null,
      moat_evidence: [],
      moat_threats: [],
    };
  }

  state.blockResults = map;
  logRun(state.runId, "info", "[sections] deterministic rubric functions executed for both lenses");
}

// -----------------------------------------------------------
// Step 5: computeScoreAndGate (deterministic)
// -----------------------------------------------------------
export async function stepComputeScoreAndGate(state: PipelineState): Promise<void> {
  const activeLens = state.lensResults?.quality_compounder;
  if (activeLens) {
    const critical = evaluateCriticalCoverage(state.keyMetrics, activeLens.lens);
    const priorConflicts = state.dataQuality?.conflictingMetrics ?? [];
    const defaultProfile: BusinessModelProfile = {
      type: "Other",
      confidence: "medium" as const,
      evidence: [],
      recurringRevenueLike: null,
      assetIntensity: null,
      regulated: null,
      primaryFramework: "general_equity" as const,
    };
    const zeroBreakdown = Object.fromEntries(
      (Object.keys(BLOCK_WEIGHTS) as BlockKey[]).map((key) => [key, 0]),
    ) as Record<BlockId, number>;

    if (state.analysisDomain === "qualitative") {
      const thesis = buildQualitativeThesis({
        facts: state.facts ?? [],
        keyMetrics: state.keyMetrics ?? KeyMetricsSchema.parse({}),
        profile: state.businessModelProfile,
        plausibilityFlags: state.plausibilityFlags ?? [],
      });
      state.qualitativeThesis = thesis;
      state.scoreTotal = null;
      state.coverage = activeLens.coverage;
      state.scoreBreakdown = zeroBreakdown;
      state.gate = activeLens.safetyGate.status === "blocked" ? "Red" : "Yellow";
      state.category = thesis.verdict === "spekulativ_risiko" ? "Hype/Risk" : "Transitional";
      state.hardBlockers = activeLens.safetyGate.status === "blocked" ? activeLens.safetyGate.reasons : [];
      state.redFlags = [...(state.redFlags ?? [])];
      state.redFlagsClustered = [];
      state.dataQuality = {
        keyMetricCoverage: activeLens.coverage,
        criticalMetricCoverage: critical.coverage,
        indicatorScoreCoverage: activeLens.coverage,
        sourceSupportCoverage: Math.max(0.4, Math.min(1, (state.sourceMap?.size ?? 0) / 12)),
        providerCrossCheckCoverage: priorConflicts.length > 0 ? 1 : 0,
        applicabilityAdjustedCoverage: activeLens.coverage,
        missingCriticalMetrics: critical.missing,
        notApplicableMetrics: [],
        unsupportedClaims: [],
        conflictingMetrics: priorConflicts,
      };
      state.confidence = thesis.conviction;
      state.thesis = {
        thesis_summary: [
          `${state.businessModelProfile?.type ?? "Story-Stock"} wird qualitativ statt fundamental bewertet.`,
          ...(state.analysisDomainReasons ?? []),
        ].join(" "),
        bull_case: thesis.bull.map((item) => item.claim),
        bear_case: thesis.bear.map((item) => item.claim),
        catalysts: thesis.catalysts.map((item) => item.claim),
        open_questions: thesis.executionRisks,
        falsification_tests: thesis.falsification,
      };
      logRun(state.runId, "info", `[score] routed to qualitative thesis mode profile=${state.businessModelProfile?.primaryFramework ?? "unknown"}`);
      return;
    }

    if (state.analysisDomain === "data_incomplete") {
      state.scoreTotal = null;
      state.coverage = activeLens.coverage;
      state.scoreBreakdown = zeroBreakdown;
      state.gate = "Yellow";
      state.category = "Too Hard";
      state.hardBlockers = [];
      state.redFlags = [...(state.redFlags ?? [])];
      state.redFlagsClustered = [];
      state.dataQuality = {
        keyMetricCoverage: activeLens.coverage,
        criticalMetricCoverage: critical.coverage,
        indicatorScoreCoverage: activeLens.coverage,
        sourceSupportCoverage: Math.max(0, Math.min(1, (state.sourceMap?.size ?? 0) / 12)),
        providerCrossCheckCoverage: priorConflicts.length > 0 ? 1 : 0,
        applicabilityAdjustedCoverage: activeLens.coverage,
        missingCriticalMetrics: critical.missing,
        notApplicableMetrics: [],
        unsupportedClaims: [],
        conflictingMetrics: priorConflicts,
      };
      state.confidence = "low";
      state.thesis = {
        thesis_summary: "Fundamentales Urteil ausgesetzt: Datenbasis ist für die anwendbare Rubrik unvollständig.",
        bull_case: [],
        bear_case: [],
        catalysts: [],
        open_questions: [...critical.missing, ...(state.analysisDomainReasons ?? [])],
        falsification_tests: ["Run mit vollständiger Datenbasis erneut ausführen."],
      };
      logRun(state.runId, "info", "[score] routed to data_incomplete mode");
      return;
    }

    state.scoreTotal = activeLens.score;
    state.coverage = activeLens.coverage;
    state.scoreBreakdown = activeLens.blockBreakdown as Record<BlockId, number>;
    state.gate = activeLens.gate;
    state.category = activeLens.category;
    const initialConfidence = activeLens.coverage >= THRESHOLDS.coverage_floor ? "high" : "medium";
    state.hardBlockers = activeLens.notScorableWithStandardRubric
      ? [activeLens.notScorableReason ?? "Not scorable with standard rubric"]
      : state.gate === "Red"
        ? ["Deterministic lens gate triggered"]
        : [];
    state.redFlags = [...(state.redFlags ?? [])];
    state.redFlagsClustered = [];
    state.dataQuality = {
      keyMetricCoverage: activeLens.coverage,
      criticalMetricCoverage: critical.coverage,
      indicatorScoreCoverage: activeLens.coverage,
      sourceSupportCoverage: 1,
      providerCrossCheckCoverage: priorConflicts.length > 0 ? 1 : 0,
      applicabilityAdjustedCoverage: activeLens.coverage,
      missingCriticalMetrics: critical.missing,
      notApplicableMetrics: [],
      unsupportedClaims: [],
      conflictingMetrics: priorConflicts,
    };
    state.confidence = applyConfidenceCaps(
      initialConfidence,
      state.dataQuality,
      {
        unsupportedCriticalClaims: [],
        conflictingCriticalMetrics: state.dataQuality.conflictingMetrics,
      },
      state.businessModelProfile ?? defaultProfile,
    );
    if (critical.missing.length > 0) {
      state.auditEvents = state.auditEvents ?? [];
      state.auditEvents.push({
        level: "warn",
        type: "missing_critical_metrics",
        details: { lens: activeLens.lens, missing: critical.missing },
      });
    }
    logRun(
      state.runId,
      "info",
      `[score] lens=${activeLens.lens} total=${state.scoreTotal} gate=${state.gate} cat=${state.category} criticalCoverage=${critical.coverage.toFixed(2)}`,
    );
    return;
  }

  // Fallback for legacy flow (should rarely trigger once dataset scoring is active).
  const blocks = {} as Record<BlockKey, IndicatorScore[]>;
  for (const b of SECTION_BLOCKS) {
    const r = state.blockResults?.[b.id];
    blocks[b.id] = (r?.indicators ?? []).map((i) => ({ key: i.name, value: typeof i.score === "number" ? i.score : null }));
  }
  const scored = computeScore(blocks);
  state.scoreTotal = scored.total;
  state.coverage = scored.coverage;
  state.scoreBreakdown = Object.fromEntries(
    (Object.keys(scored.blocks) as BlockKey[]).map((k) => [k, Math.round(scored.blocks[k].weighted * 100) / 100]),
  ) as Record<BlockId, number>;
  state.category = "Transitional";
  state.confidence = "medium";
  state.hardBlockers = [];
  state.gate = computeGate({
    scoreTotal: state.scoreTotal,
    coverage: state.coverage,
    confidence: state.confidence,
    category: state.category,
    hardBlockers: state.hardBlockers,
  });
}

// -----------------------------------------------------------
// Step 5b: timing axis (deterministic, orthogonal to fundamental score)
// -----------------------------------------------------------
export async function stepComputeTimingAxis(state: PipelineState): Promise<void> {
  const dataset = state.normalizedDataset ?? state.companyDataset;
  const active = state.lensResults?.quality_compounder;
  if (!dataset || !active) return;

  const price = dataset.prices.daily;
  let benchmark = price;
  let sectorBenchmark = price;

  const sectorToEtf = (sector: string | null | undefined): string => {
    const s = (sector ?? "").toLowerCase();
    if (s.includes("technology")) return "XLK";
    if (s.includes("financial")) return "XLF";
    if (s.includes("health")) return "XLV";
    if (s.includes("energy")) return "XLE";
    if (s.includes("real estate")) return "XLRE";
    if (s.includes("materials")) return "XLB";
    if (s.includes("consumer discretionary")) return "XLY";
    if (s.includes("consumer staples")) return "XLP";
    if (s.includes("industrial")) return "XLI";
    if (s.includes("communication")) return "XLC";
    if (s.includes("utilities")) return "XLU";
    return "SPY";
  };

  try {
    const idx = await gatherCompanyDatasetDetailed("SPY", {
      asOf: state.runDate,
      runId: `${state.runId}_timing_index`,
    });
    if (idx.dataset.prices.daily.length > 0) benchmark = idx.dataset.prices.daily;
  } catch {
    // deterministic fallback uses company series
  }

  try {
    const sector = await gatherCompanyDatasetDetailed(sectorToEtf(dataset.identity.sector), {
      asOf: state.runDate,
      runId: `${state.runId}_timing_sector`,
    });
    if (sector.dataset.prices.daily.length > 0) sectorBenchmark = sector.dataset.prices.daily;
  } catch {
    // deterministic fallback uses company series
  }

  state.technicals = computeTechnicals({
    price,
    benchmark,
    sectorBenchmark,
  });

  // Fetch global MarketHealth (cached, non-blocking) and stamp posture
  if (!state.marketHealth) {
    try {
      state.marketHealth = await fetchAndComputeMarketHealth();
    } catch {
      // non-fatal — posture stays undefined
    }
  }

  if (state.marketContext) {
    const proxy =
      state.marketContext.breadthPctAboveMa200 ??
      state.marketHealth?.pillars.breadth.inputs["pctAboveMa200"] as number | null ??
      (typeof state.marketContext.indexVsMa200Pct === "number"
        ? Math.max(0, Math.min(1, 0.5 + state.marketContext.indexVsMa200Pct * 2))
        : null);
    state.regimeResult = classifyMarketRegime({
      marketContext: state.marketContext,
      breadthProxy: proxy,
    });
  }

  const estimatesSignals = computeEstimatesSignals(dataset);
  const ownershipSignals = computeOwnershipSignals(dataset);
  state.timing = buildTimingOutput(
    active,
    {
      technicals: state.technicals,
      estimatesSignals,
      ownershipSignals: {
        squeezeSetup: ownershipSignals.squeezeSetup,
        shortRisk: ownershipSignals.shortRisk,
      },
    },
    state.regimeResult?.regime ?? "neutral",
  );

  logRun(
    state.runId,
    "info",
    `[timing] score=${state.timing.timingScore.toFixed(1)} quadrant=${state.timing.quadrant.label} regime=${state.regimeResult?.regime ?? "neutral"}`,
  );
}

// -----------------------------------------------------------
// Step 6: analyst interpretation (optional, non-blocking)
// -----------------------------------------------------------
export async function stepInterpretAnalyst(state: PipelineState): Promise<void> {
  if (state.analysisDomain && state.analysisDomain !== "fundamental") {
    state.analyst = null;
    logRun(state.runId, "info", `[analyst] skipped for domain=${state.analysisDomain}`);
    return;
  }

  const scoreBreakdown = ScoreBreakdownSchema.parse(state.scoreBreakdown);
  const deterministicReport = ReportSchema.parse({
    ticker: state.ticker,
    company_name: state.identity?.company_name ?? "",
    isin: state.identity?.isin ?? "",
    exchange: state.identity?.exchange ?? "",
    sector: state.identity?.sector ?? "",
    industry: state.identity?.industry ?? "",
    research_date: state.runDate,
    analysis_domain: state.analysisDomain ?? "fundamental",
    category: state.category,
    growth_research_score: state.scoreTotal,
    gate: state.gate,
    confidence: state.confidence,
    key_metrics: state.keyMetrics,
    score_breakdown: scoreBreakdown,
    moat_assessment: {
      rating: "Unknown",
      sources: [],
      evidence: [],
      threats: [],
    },
    valuation_regime: state.lensResults?.quality_compounder?.valuationRegime ?? null,
    fair_value_corridor: state.lensResults?.quality_compounder?.fairValueCorridor ?? null,
    current_vs_fair_value_pct: state.lensResults?.quality_compounder?.currentVsFairValuePct ?? null,
    timing_score: state.timing?.timingScore ?? null,
    regime: state.regimeResult?.regime ?? null,
    quadrant: state.timing?.quadrant ?? null,
    trade_setup: state.tradeSetup,
  });

  const evidence = buildAnalystEvidence(deterministicReport, state.normalizedDataset ?? state.companyDataset ?? null, state.facts ?? []);
  const beforeFingerprint = numericFingerprint(deterministicReport);
  const analyst = await interpretReport(deterministicReport as Readonly<Report>, evidence, {
    runId: state.runId,
    artifactsDir: state.rawDir,
    model: process.env.LLM_MODEL ?? state.modelSummary,
    redTeamModel: process.env.LLM_MODEL ?? state.modelSummary,
    enabled: process.env.ENABLE_ANALYST_LLM !== "0",
  });
  const afterFingerprint = numericFingerprint(deterministicReport);
  if (beforeFingerprint !== afterFingerprint) {
    throw new Error("Analyst step attempted to mutate deterministic numeric fields.");
  }

  state.analyst = analyst;

  // P2: KI Axis Judgment — update axes in the active lens result with KI sub-scores
  const activeLensResult = state.lensResults?.quality_compounder;
  if (activeLensResult && activeLensResult.axes.length > 0) {
    const updatedAxes = await interpretAxes(
      activeLensResult.axes,
      deterministicReport as Readonly<Report>,
      evidence,
      {
        runId: state.runId,
        artifactsDir: state.rawDir,
        model: process.env.LLM_MODEL ?? state.modelSummary,
        enabled: process.env.ENABLE_ANALYST_LLM !== "0",
      },
    );
    // Mutate in-place — lensResults is a local pipeline state object, not shared
    activeLensResult.axes = updatedAxes;
    activeLensResult.needsAxisReview = updatedAxes.some(
      (a) => a.divergence !== null && a.divergence >= THRESHOLDS.axis_divergence_review,
    );
  }

  if (analyst) {
    state.thesis = {
      thesis_summary: [analyst.thesis, analyst.numbersSay].filter(Boolean).join(" "),
      bull_case: [analyst.bullCase].filter(Boolean),
      bear_case: [analyst.bearCase].filter(Boolean),
      catalysts: analyst.catalysts.map((c) => `${c.text} [${c.status}]`),
      open_questions: [analyst.entryTrigger].filter(Boolean),
      falsification_tests: [analyst.exitWatchTrigger].filter(Boolean),
    };
    logRun(state.runId, "info", `[analyst] interpretation completed with model=${analyst.model.name}`);
    return;
  }

  state.thesis = {
    thesis_summary: "Analyst interpretation unavailable. Deterministic result remains complete.",
    bull_case: [],
    bear_case: [],
    catalysts: [],
    open_questions: [],
    falsification_tests: [],
  };
  logRun(state.runId, "info", "[analyst] skipped or unavailable");
}

// Backward-compatible no-op exports
export async function stepSummarize(_state: PipelineState): Promise<void> {}
export async function stepRedTeam(_state: PipelineState): Promise<void> {}

// -----------------------------------------------------------
// Step 7a: computeFairValue (deterministic)
// -----------------------------------------------------------

/** Helper: get latest numeric fact value */
function latestNumFact(facts: ProviderFact[], field: string): number | null {
  const match = facts
    .filter((f) => f.field === field)
    .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
  if (!match) return null;
  const v = match.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numericFingerprint(input: unknown): string {
  const entries: string[] = [];
  const visit = (value: unknown, pathParts: string[]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      entries.push(`${pathParts.join(".")}:${Object.is(value, -0) ? "-0" : value}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, idx) => visit(item, [...pathParts, String(idx)]));
      return;
    }
    if (value && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        visit((value as Record<string, unknown>)[key], [...pathParts, key]);
      }
    }
  };
  visit(input, []);
  return crypto.createHash("sha256").update(entries.join("|"), "utf8").digest("hex");
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
  }
  if (typeof value !== "object" || value === null) return [];
  const rec = value as Record<string, unknown>;
  for (const key of ["annualReports", "quarterlyReports", "historical", "data"]) {
    const arr = rec[key];
    if (Array.isArray(arr)) {
      return arr.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
    }
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readNumberCaseInsensitive(record: Record<string, unknown>, keys: string[]): number | null {
  const map = new Map(Object.keys(record).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = map.get(key.toLowerCase());
    if (!actual) continue;
    const n = toNumber(record[actual]);
    if (n !== null) return n;
  }
  return null;
}

function extractHistoricalMultipleSeries(
  facts: ProviderFact[],
  fieldNeedles: string[],
  valueKeys: string[],
): number[] {
  const out: number[] = [];
  for (const fact of facts) {
    const field = fact.field.toLowerCase();
    if (!fieldNeedles.some((needle) => field.includes(needle))) continue;

    const rows = asRecordArray(fact.value);
    if (rows.length === 0 && typeof fact.value === "object" && fact.value !== null) {
      const direct = readNumberCaseInsensitive(fact.value as Record<string, unknown>, valueKeys);
      if (direct !== null && direct > 0) out.push(direct);
      continue;
    }

    for (const row of rows) {
      const value = readNumberCaseInsensitive(row, valueKeys);
      if (value !== null && value > 0) out.push(value);
    }
  }
  return out.slice(0, 12);
}

/** Pick top N blocks by score (as string keys) */
function pickTopBlocks(breakdown: Record<string, number>, n: number): string[] {
  return Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export async function stepComputeFairValue(state: PipelineState): Promise<void> {
  const facts = state.facts ?? [];

  // Current price and currency from facts
  const currentPrice =
    latestNumFact(facts, "price") ??
    latestNumFact(facts, "regularMarketPrice") ??
    null;
  const currencyFact = facts.find((f) => f.field === "currency")?.value;
  const currency = typeof currencyFact === "string" ? currencyFact : "USD";

  const netDebt = state.debtBreakdown?.net_debt_interest_bearing ?? null;
  const shares =
    latestNumFact(facts, "shares_outstanding") ??
    latestNumFact(facts, "sharesOutstanding") ??
    null;
  const revenueTtm =
    latestNumFact(facts, "revenue_ttm") ??
    latestNumFact(facts, "totalRevenueTTM") ??
    null;

  // Peer medians from bucket
  const bucket = state.peerPercentiles?.bucketId
    ? (() => {
        const { PEER_BUCKETS } = require("@/lib/research/peer-universe") as typeof import("@/lib/research/peer-universe");
        return PEER_BUCKETS.find((b) => b.bucketId === state.peerPercentiles!.bucketId) ?? null;
      })()
    : null;

  const peerMedians = {
    ev_sales: bucket?.medians.ev_sales ?? null,
    ev_gross_profit: bucket?.medians.ev_sales ? (bucket.medians.ev_sales * (1 / Math.max(bucket.medians.gross_margin ?? 0.5, 0.05))) : null,
    forward_pe: null as number | null,
    revenue_growth_yoy: bucket?.medians.revenue_growth_yoy ?? null,
    gross_margin: bucket?.medians.gross_margin ?? null,
    operating_margin: bucket?.medians.operating_margin ?? null,
  };

  // Map reverse-DCF to FairValueReverseDcfCheck format
  const rdcfInput: FairValueReverseDcfCheck | null = state.reverseDcf
    ? {
        implied_fcf_cagr: state.reverseDcf.impliedGrowthRate ?? null,
        terminal_growth: DCF_ASSUMPTIONS.terminalGrowth,
        horizon_years: state.reverseDcf.inputs?.years ?? DCF_ASSUMPTIONS.horizonYears,
        classification: state.reverseDcf.classification === "unknown" ? null : state.reverseDcf.classification,
      }
    : null;

  const result = computeFairValue({
    ticker: state.ticker,
    currency,
    currentPrice,
    asof: state.runDate,
    keyMetrics: state.keyMetrics ?? {},
    businessModel: (state.businessModelType as import("@/lib/research/business-model").BusinessModelType) ?? "Other",
    peerMedians,
    reverseDcf: rdcfInput,
    netDebt,
    sharesOutstanding: shares,
    revenueTtm,
    ownHistoricalMultiples: {
      ev_sales: extractHistoricalMultipleSeries(
        facts,
        ["key_metrics", "key-metrics", "ratios", "valuation"],
        ["evToSales", "evToSalesTTM", "enterpriseValueRevenueMultiple", "ev_sales"],
      ),
      ev_gross_profit: extractHistoricalMultipleSeries(
        facts,
        ["key_metrics", "key-metrics", "ratios", "valuation"],
        ["evToGrossProfit", "evToGrossProfitTTM", "ev_gross_profit"],
      ),
      forward_pe: extractHistoricalMultipleSeries(
        facts,
        ["ratios", "key_metrics", "key-metrics", "valuation"],
        ["priceEarningsRatio", "peRatio", "forwardPE", "forward_pe"],
      ),
    },
  });

  state.fairValue = result;

  logRun(
    state.runId,
    "info",
    `[fair_value] point=${result.point_estimate?.toFixed(2) ?? "n/a"} class=${result.classification ?? "n/a"} conf=${result.confidence}`,
  );
}

// -----------------------------------------------------------
// Step 7b: generateVerdict (LLM + deterministic)
// -----------------------------------------------------------
export async function stepGenerateVerdict(state: PipelineState): Promise<void> {
  if (state.analysisDomain === "qualitative") {
    const thesis = state.qualitativeThesis;
    const label = thesis?.verdict === "spekulativ_chance"
      ? "Qualitativ — spekulative Chance"
      : thesis?.verdict === "spekulativ_risiko"
        ? "Qualitativ — spekulatives Risiko"
        : "Qualitativ — beobachten";
    state.verdict = {
      label,
      reasonCode: "qualitative_domain",
      weakestBlock: null,
      detail: (state.analysisDomainReasons ?? []).join(" ") || "Fundamentalscore bewusst unterdrückt; These aus Quellenhinweisen ableiten.",
    };
    logRun(state.runId, "info", `[verdict] label="${label}" code=qualitative_domain`);
    return;
  }

  if (state.analysisDomain === "data_incomplete") {
    state.verdict = {
      label: "Erneut ausführen — Daten unvollständig",
      reasonCode: "data_incomplete",
      weakestBlock: null,
      detail: (state.analysisDomainReasons ?? []).join(" ") || "Schlüsseldaten fehlen oder konnten technisch nicht belastbar abgeleitet werden.",
    };
    logRun(state.runId, "info", "[verdict] label=Erneut ausführen — Daten unvollständig code=data_incomplete");
    return;
  }

  const verdictDet = buildVerdict({
    gate: state.gate!,
    category: state.category!,
    confidence: state.confidence!,
    scoreTotal: state.scoreTotal!,
    hardBlockers: state.hardBlockers ?? [],
    scoreBreakdown: state.scoreBreakdown! as Record<import("@/lib/scoring/weights").BlockKey, number>,
    weights: BLOCK_WEIGHTS,
    fairValueClassification: state.fairValue?.classification ?? null,
    upsidePct: state.fairValue?.upside_pct ?? null,
  });

  const topStrengths = pickTopBlocks(state.scoreBreakdown ?? {}, 2);
  const topConcerns = [...(state.hardBlockers ?? []), ...(state.redFlags ?? [])].slice(0, 3);

  let detail = `${verdictDet.label}. Siehe Block-Detail.`;

  try {
    const result = await chatJSON<{ detail: string }>({
      runId: state.runId,
      step: "verdict_detail",
      model: state.modelSummary,
      system: VERDICT_DETAIL_SYSTEM,
      user: VERDICT_DETAIL_USER({
        ticker: state.ticker,
        label: verdictDet.label,
        reasonCode: verdictDet.reasonCode,
        weakestBlock: verdictDet.weakestBlock,
        topStrengths,
        topConcerns,
      }),
      temperature: 0.3,
      artifactsDir: state.rawDir,
    });
    const { data } = result;
    state.effectiveModels = state.effectiveModels ?? { scoring: {} };
    state.llmCalls = state.llmCalls ?? [];
    state.effectiveModels.verdictDetail = result.effectiveModel;
    state.llmCalls.push({
      step: "verdict_detail",
      provider: result.provider,
      requestedModel: result.model,
      model: result.effectiveModel,
      tokensIn: result.usage?.promptTokens,
      tokensOut: result.usage?.completionTokens,
      rateLimit: result.rateLimit,
      systemFingerprint: result.systemFingerprint,
    });
    detail = sanitizeVerdictDetail(data.detail, verdictDet.label);
  } catch {
    logRun(state.runId, "warn", "[verdict] LLM detail failed, using deterministic fallback");
  }

  state.verdict = { ...verdictDet, detail };
  logRun(state.runId, "info", `[verdict] label="${verdictDet.label}" code=${verdictDet.reasonCode}`);
}

// -----------------------------------------------------------
// Step 7d: computeTradeSetup (deterministic)
// -----------------------------------------------------------
export async function stepComputeTradeSetup(state: PipelineState): Promise<void> {
  if (state.analysisDomain && state.analysisDomain !== "fundamental") {
    state.tradeSetup = {
      entry_zone_max: null,
      margin_of_safety: null,
      stop_ref: null,
      risk_reward: null,
      action: "warten",
      sizing_hint: state.marketContext?.regime === "risk_off" ? "kleiner" : "nicht_beurteilbar",
      distance_to_entry_zone_pct: null,
      computable: false,
    };
    logRun(state.runId, "info", `[trade_setup] skipped for domain=${state.analysisDomain}`);
    return;
  }

  state.tradeSetup = computeTradeSetup({
    gate: state.gate ?? "Yellow",
    lens: state.lensResults?.quality_compounder?.lens ?? "quality_compounder",
    regime: state.regimeResult?.regime ?? state.marketContext?.regime ?? null,
    fairValue: state.fairValue
      ? {
          current_price: state.fairValue.current_price,
          range_low: state.fairValue.range_low,
          point_estimate: state.fairValue.point_estimate,
        }
      : null,
    technicals: state.technicals
      ? {
          sma200: state.technicals.sma200,
          atr: state.technicals.atr,
        }
      : null,
  });

  logRun(
    state.runId,
    "info",
    `[trade_setup] computable=${state.tradeSetup.computable} action=${state.tradeSetup.action} rr=${state.tradeSetup.risk_reward ?? "n/a"}`,
  );
}

// -----------------------------------------------------------
// Step 7c: computePeerPercentiles (deterministic, no LLM)
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
function resolveCodeVersion(): string {
  if (process.env.BUILD_GIT_SHA) return process.env.BUILD_GIT_SHA;
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    const out = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    if (out) return out;
  } catch {
    // best-effort only
  }
  return "dev";
}

export async function stepPersist(state: PipelineState): Promise<{ reportId: string; reportMdPath: string; reportJsonPath: string }> {
  const reportId = ulid();
  state.reportId = reportId;

  // Source list für Report
  const sourceList = Array.from(state.sourceMap?.entries() ?? []).map(([idx, s]) => ({
    idx,
    url: sanitizeUrlForAudit(s.url),
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
  const codeVersion = resolveCodeVersion();
  const providerVersions = Object.fromEntries(
    Array.from(new Set((state.providerResults ?? []).map((r) => r.provider))).map((name) => [name, "unknown"]),
  );
  const runIntegrityBanner = state.runIncompleteDueToTechnicalFailure
    ? "Lauf unvollständig — technischer Abruf-Fehler, bitte erneut ausführen."
    : "";

  const blockAudits = SECTION_BLOCKS.map((b) => {
    const r = state.blockResults?.[b.id];
    return {
      block: b.id,
      indicators: (r?.indicators ?? []).map((i) => ({
        name: i.name,
        score: typeof i.score === "number" ? i.score : null,
        rationale: i.rationale ?? "",
        reason: i.reason ?? i.rationale ?? "",
        inputs: i.inputs ?? [],
        sourceIdx: i.sourceIdx != null ? [i.sourceIdx] : [],
        scoreType: i.scoreType ?? "llm_judgment",
        scoreValid: i.scoreValid ?? (typeof i.score === "number"),
        rationaleValid: i.rationaleValid ?? true,
        sourceSupportStatus: i.sourceSupportStatus ?? "not_checked",
        metricRefs: i.metricRefs ?? [],
        missingMetricRefs: i.missingMetricRefs ?? [],
        dataStatus: i.dataStatus ?? "valid",
        invalidSourceRefs: i.invalidSourceRefs ?? [],
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
    analysis_domain: state.analysisDomain ?? "fundamental",
    analysis_domain_reasons: state.analysisDomainReasons ?? [],
    category: state.category,
    growth_research_score: state.scoreTotal,
    gate: state.gate,
    confidence: state.confidence,
    lens: state.lensResults?.quality_compounder?.lens ?? "quality_compounder",
    rubric_class: state.lensResults?.quality_compounder?.rubricClass ?? "industrial_software",
    not_scorable_with_standard_rubric:
      state.lensResults?.quality_compounder?.notScorableWithStandardRubric ?? false,
    not_scorable_reason: state.lensResults?.quality_compounder?.notScorableReason ?? null,
    reporting_currency: state.normalization?.reportingCurrency ?? THRESHOLDS.reporting_currency_default,
    gaap_vs_adjusted: state.normalization?.gaapVsAdjusted ?? {
      gaap: {},
      adjusted: {},
      sbcAdjustmentRatio: 1,
    },
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
    red_flags_clustered: state.redFlagsClustered ?? [],
    open_questions: state.thesis?.open_questions ?? [],
    falsification_tests: state.thesis?.falsification_tests ?? [],
    source_list: sourceList,
    handoff_to_trade_engine: canHandoffToTradeEngine({
      scoreTotal: state.analysisDomain === "fundamental" ? (state.scoreTotal ?? 0) : 0,
      coverage: state.coverage!,
      confidence: state.confidence!,
      category: state.category!,
      hardBlockers: state.analysisDomain === "fundamental" ? state.hardBlockers! : [],
    }),
    models: {
      extract: state.effectiveModels?.extract ?? null,
      scoring: state.effectiveModels?.scoring ?? {},
      summary: state.effectiveModels?.summary ?? null,
      red_team: state.effectiveModels?.redTeam ?? null,
      verdict_detail: state.effectiveModels?.verdictDetail ?? null,
    },
    audit_events: state.auditEvents ?? [],
    audit_llm_calls: state.llmCalls ?? [],
    invalid_source_refs: Array.from(new Set(state.invalidSourceRefs ?? [])),
    business_model_profile: state.businessModelProfile ?? null,
    metric_applicability: state.metricApplicability ?? {},
    qualitative_thesis: state.qualitativeThesis ?? null,
    plausibility_flags: state.plausibilityFlags ?? [],
    data_quality: {
      coverage: state.dataQuality ?? {
        keyMetricCoverage: 0,
        criticalMetricCoverage: 0,
        indicatorScoreCoverage: 0,
        sourceSupportCoverage: 0,
        providerCrossCheckCoverage: 0,
        applicabilityAdjustedCoverage: 0,
        missingCriticalMetrics: [],
        notApplicableMetrics: [],
        unsupportedClaims: [],
        conflictingMetrics: [],
      },
      confidence_cap_reason:
        (state.dataQuality?.criticalMetricCoverage ?? 1) < 0.55
          ? "Critical coverage below threshold"
          : "",
      provider_coverage_matrix: [],
      issues: state.debtBreakdown?.issues ?? [],
    },
    debt_breakdown: state.debtBreakdown ?? null,
    source_counts: {
      external: sourceList.filter((s) => !/^derived:/i.test(s.url)).length,
      internal_derived: sourceList.filter((s) => /^derived:/i.test(s.url)).length,
      sec_filings: sourceList.filter((s) => /sec\.gov|edgar/i.test(s.url)).length,
      market_data: sourceList.filter((s) => /yahoo|alphavantage|financialmodelingprep|fmp/i.test(s.url)).length,
      news: sourceList.filter((s) => /news|rss|businesswire/i.test(s.url)).length,
    },
    trader_cockpit: {
      actionability:
        state.analysisDomain === "data_incomplete"
          ? "data_insufficient"
          : (state.dataQuality?.criticalMetricCoverage ?? 1) < 0.4
          ? "data_insufficient"
          : state.gate === "Green"
            ? "watchlist"
            : "research_only",
      primary_blocker:
        (state.hardBlockers ?? [])[0]
        ?? (state.analysisDomain !== "fundamental" ? (state.analysisDomainReasons ?? [])[0] ?? null : null),
      blocker_type:
        state.analysisDomain === "data_incomplete"
          ? "data_quality"
          : (state.dataQuality?.criticalMetricCoverage ?? 1) < 0.55
          ? "data_quality"
          : (state.hardBlockers?.length ?? 0) > 0
            ? "hard"
            : null,
      data_quality_label:
        (state.dataQuality?.criticalMetricCoverage ?? 0) >= 0.75
          ? "strong"
          : (state.dataQuality?.criticalMetricCoverage ?? 0) >= 0.55
            ? "medium"
            : "weak",
      critical_missing_data: state.dataQuality?.missingCriticalMetrics ?? [],
      top_bull_points: (state.thesis?.bull_case ?? []).slice(0, 3),
      top_bear_points: (state.thesis?.bear_case ?? []).slice(0, 3),
      next_recheck_trigger: null,
    },
    score_heatmap: (Object.entries(state.scoreBreakdown ?? {}) as Array<[BlockKey, number]>).map(([block, score]) => ({
      block,
      score,
      maxScore: BLOCK_WEIGHTS[block],
      normalizedScore: BLOCK_WEIGHTS[block] > 0 ? Math.round((score / BLOCK_WEIGHTS[block]) * 100) : 0,
      confidence: state.confidence ?? "low",
      coverage: state.coverage ?? 0,
      trend: "unknown",
      peerPercentile: null,
      dataStatus: (state.dataQuality?.criticalMetricCoverage ?? 0) < 0.55 ? "weak" : "valid",
    })),
    source_confidence_matrix: (state.blockResults
      ? Object.values(state.blockResults)
          .flatMap((b) => b.indicators)
          .map((i) => ({
            claim: `${i.name}: ${i.rationale}`,
            claimType: i.scoreType === "deterministic" ? "metric" : "rationale",
            sourceClass: null,
            sourceIdx: i.sourceIdx != null ? [i.sourceIdx] : [],
            confidence: i.rationaleValid === false ? "low" : "medium",
            supportStatus: i.sourceSupportStatus ?? "not_checked",
          }))
      : []),
    chart_data: (() => {
      const chartDs = state.normalizedDataset ?? state.companyDataset;
      const annualPeriods = chartDs?.annual ?? [];
      const financials_annual = annualPeriods.map((p) => {
        const rev = typeof p.revenue === "object" && p.revenue !== null ? (p.revenue as { value: number | null }).value : null;
        const gp = typeof p.grossProfit === "object" && p.grossProfit !== null ? (p.grossProfit as { value: number | null }).value : null;
        const ebit = typeof p.ebit === "object" && p.ebit !== null ? (p.ebit as { value: number | null }).value : null;
        const fcf = typeof p.freeCashflow === "object" && p.freeCashflow !== null ? (p.freeCashflow as { value: number | null }).value : null;
        const grossMargin = rev && rev > 0 && gp !== null ? gp / rev : null;
        const operatingMargin = rev && rev > 0 && ebit !== null ? ebit / rev : null;
        const fcfMargin = rev && rev > 0 && fcf !== null ? fcf / rev : null;
        return {
          year: typeof p.periodEnd === "string" ? p.periodEnd.slice(0, 4) : String(p.fiscalYear ?? ""),
          revenue: rev,
          grossProfit: gp,
          ebit,
          fcf,
          grossMargin,
          operatingMargin,
          fcfMargin,
        };
      }).filter((p) => p.year !== "");
      return {
        financials_quarterly: [],
        dilution: [],
        valuation: [],
        financials_annual,
      };
    })(),
    // Phase A: forensics & business model
    business_model_type: state.businessModelType ?? "",
    piotroski_components: state.forensicsResult?.piotroski?.components ?? {},
    mohanram_components: state.forensicsResult?.mohanram?.components ?? {},
    altman_classification: state.forensicsResult?.altman?.classification ?? null,
    beneish_manipulation_probability: state.forensicsResult?.beneish?.manipulationProbability ?? null,

    // Phase C (legacy): Red-Team
    red_team: null,

    // Phase E: Reverse-DCF
    reverse_dcf: state.reverseDcf
      ? {
          implied_growth_rate: state.reverseDcf.impliedGrowthRate ?? null,
          classification: state.reverseDcf.classification ?? "unknown",
        }
      : null,

    // Phase 2 deterministic scoring outputs
    valuation_regime: state.lensResults?.quality_compounder?.valuationRegime ?? null,
    fair_value_corridor: state.lensResults?.quality_compounder?.fairValueCorridor ?? null,
    current_vs_fair_value_pct: state.lensResults?.quality_compounder?.currentVsFairValuePct ?? null,
    expectations_gap: state.lensResults?.quality_compounder?.expectationsGap ?? null,
    inflection_flags: state.lensResults?.quality_compounder?.inflectionFlags ?? null,
    ownership_score: state.lensResults?.quality_compounder?.ownershipScore ?? null,
    aaqs_binary: state.lensResults?.quality_compounder?.aaqsBinary ?? null,
    stability_scores: state.lensResults?.quality_compounder?.stabilityScores ?? null,
    lens_results: state.lensResults
      ? [state.lensResults.quality_compounder, state.lensResults.emerging_winner, state.lensResults.quality_garp]
      : [],
    technicals: state.technicals ?? null,
    regime: state.regimeResult?.regime ?? null,
    breadth_is_proxy: state.regimeResult?.breadthIsProxy ?? false,
    timing_score: state.timing?.timingScore ?? null,
    quadrant: state.timing?.quadrant
      ? {
          ...state.timing.quadrant,
          yFundamentalScore: state.analysisDomain === "fundamental" ? state.scoreTotal : null,
        }
      : null,
    action_recommendation:
      state.analysisDomain === "qualitative"
        ? (state.qualitativeThesis?.verdict === "spekulativ_risiko"
            ? "avoid"
            : "watch")
        : state.analysisDomain === "data_incomplete"
          ? "watch"
          : state.timing?.actionRecommendation ?? null,
    analyst: state.analyst ?? null,
    trade_setup: state.tradeSetup,

    // Phase F: Fair Value
    fair_value: state.fairValue ?? null,

    // Phase F: Verdict
    verdict: state.verdict
      ? {
          label: state.verdict.label,
          reason_code: state.verdict.reasonCode,
          weakest_block: state.verdict.weakestBlock ?? null,
          detail: state.verdict.detail,
        }
      : null,
  });

  const activeLens = state.lensResults?.quality_compounder;
  const axesSnapshot = activeLens?.axes.length
    ? {
        growth: activeLens.axes.find((a) => a.axis === "growth")?.combined ?? null,
        finance: activeLens.axes.find((a) => a.axis === "finance")?.combined ?? null,
        moat: activeLens.axes.find((a) => a.axis === "moat")?.combined ?? null,
      }
    : null;

  const scoreHistory = persistScoreHistoryEntry({
    reportId,
    ticker: state.ticker.toUpperCase(),
    researchDate: state.runDate,
    scoreTotal: Math.round(state.scoreTotal ?? reportData.growth_research_score ?? 0),
    gate: reportData.gate,
    confidence: reportData.confidence,
    axes: axesSnapshot,
    safetyStatus: activeLens?.safetyGate.status ?? null,
    archetype: reportData.category ?? null,
  });

  reportData.market_context = state.marketContext
    ? {
        as_of: state.marketContext.asOf,
        regime: state.regimeResult?.regime ?? state.marketContext.regime ?? null,
        breadth_pct_above_ma200: state.marketContext.breadthPctAboveMa200,
        index_vs_ma200_pct: state.marketContext.indexVsMa200Pct,
        vix: state.marketContext.vix,
        vix_percentile_1y: state.marketContext.vixPercentile1y,
        high_yield_spread: state.marketContext.highYieldSpread,
        yield_curve_10y2y: state.marketContext.yieldCurve10y2y,
        market_posture_score: state.marketHealth?.score ?? null,
        market_posture_label: state.marketHealth?.posture ?? null,
        market_pillar_agreement: state.marketHealth?.pillarAgreement ?? null,
      }
    : null;
  reportData.sector_baseline_used = state.lensResults?.quality_compounder?.sectorBaselineUsed ?? null;
  reportData.combo_flags = state.lensResults?.quality_compounder?.comboFlags ?? [];
  reportData.confidence_score = deriveConfidenceScore({
    coverage: state.coverage ?? 0,
    confidence: reportData.confidence,
    hardBlockers: reportData.hard_blockers,
    sectorBaseline: reportData.sector_baseline_used ?? { signals: [] },
    comboSignals: reportData.combo_flags,
    scoreTrend: scoreHistory.trend,
  });
  reportData.score_trend = scoreHistory.trend;
  reportData.assumptions = [...MODEL_ASSUMPTIONS];
  reportData.score_interpretation = {
    mode: "as_was",
    label: "As-Was",
    thresholdSetVersion: THRESHOLDS.version,
    assumptionsVersion: ASSUMPTIONS_VERSION,
  };
  reportData.audit_snapshot = {
    codeVersion,
    thresholdSetVersion: THRESHOLDS.version,
    assumptionsVersion: ASSUMPTIONS_VERSION,
    dataSnapshotId: state.runId,
    providerVersions,
    runAt: new Date().toISOString(),
  };
  reportData.run_integrity = {
    incomplete_due_to_technical_fetch_errors: state.runIncompleteDueToTechnicalFailure ?? false,
    retry_recommended: state.retryRecommended ?? false,
    banner: runIntegrityBanner,
    fetch_statuses: state.fetchDiagnostics ?? [],
  };

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
      scoreTotal:
        typeof reportData.growth_research_score === "number"
          ? Math.round(reportData.growth_research_score)
          : null,
      scoreBreakdown: JSON.stringify(reportData.score_breakdown),
      confidence: reportData.confidence,
      reportMdPath,
      reportJsonPath,
      rawDir: state.rawDir,
      createdAt: Date.now(),
      modelExtract: reportData.models.extract ?? state.modelExtract,
      modelScoring: Object.values(reportData.models.scoring)[0] ?? state.modelScoring,
      modelSummary: reportData.models.summary ?? state.modelSummary,
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
  lines.push(`**Datum:** ${r.research_date}  ·  **Gate:** ${r.gate}  ·  **Score:** ${r.growth_research_score ?? "n/a"}${r.growth_research_score != null ? "/100" : ""}  ·  **Kategorie:** ${r.category}  ·  **Confidence:** ${r.confidence}`);
  if (r.isin) {
    lines.push(`**ISIN:** ${r.isin}`);
  }
  lines.push("");
  lines.push("## Modelle");
  lines.push(`- Extract: ${r.models.extract ?? "n/a"}`);
  lines.push(`- Summary: ${r.models.summary ?? "n/a"}`);
  lines.push(`- Verdict Detail: ${r.models.verdict_detail ?? "n/a"}`);
  for (const [block, model] of Object.entries(r.models.scoring ?? {})) {
    lines.push(`- Section ${block}: ${model}`);
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
  if (r.assumptions.length > 0) {
    lines.push("## Annahmen");
    r.assumptions.forEach((a) => {
      const unit = a.unit === "years" ? " Jahre" : "";
      lines.push(`- [${a.kind}] ${a.label}: ${a.value}${unit} — ${a.rationale}`);
    });
    lines.push("");
  }

  if (r.analyst) {
    lines.push("## KI-Interpretation (nicht im Score)");
    lines.push("Interpretation, kein Urteil und keine Zahl. Eigenstaendig gegen Primaerquellen pruefen.");
    lines.push("");
  }

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
  const envModel = process.env.LLM_MODEL?.trim();
  if (envModel) {
    return { extract: envModel, scoring: envModel, summary: envModel };
  }
  const { getLLMConfig } = await import("@/lib/llm/config");
  const cfg = getLLMConfig();
  if (cfg.provider === "deepseek") {
    const m = cfg.deepseekModel || "deepseek-chat";
    return { extract: m, scoring: m, summary: m };
  }
  if (cfg.provider === "groq") {
    const m = cfg.groqModel || "meta-llama/llama-4-scout-17b-16e-instruct";
    return { extract: m, scoring: m, summary: m };
  }
  const m = await pickDefaultModel();
  return { extract: m, scoring: m, summary: m };
}
