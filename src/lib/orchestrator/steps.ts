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
import {
  EXTRACTOR_SYSTEM,
  EXTRACTOR_USER,
  SECTION_SYSTEM,
  SECTION_USER,
  SECTION_BLOCKS,
  SUMMARY_SYSTEM,
  SUMMARY_USER,
  type BlockId,
} from "@/lib/llm/prompts";
import { computeScore, type IndicatorScore } from "@/lib/scoring/score";
import { computeGate, canHandoffToTradeEngine, type Category } from "@/lib/scoring/gate";
import type { BlockKey } from "@/lib/scoring/weights";
import {
  ReportSchema,
  type Report,
  type KeyMetrics,
  ScoreBreakdownSchema,
  KeyMetricsSchema,
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
  context?: string;
  /** Numerischer Index (1-basiert) → Source-Eintrag */
  sourceMap?: Map<number, { url: string; title?: string; klass: string }>;
  identity?: {
    company_name: string;
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
  hard_blockers: string[];
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
// Step 2: buildContext
// -----------------------------------------------------------
export async function stepBuildContext(state: PipelineState): Promise<void> {
  const facts = state.facts ?? [];
  // Source-Map: dedupe über url
  const sourceMap = new Map<number, { url: string; title?: string; klass: string }>();
  const urlToIdx = new Map<string, number>();
  let idx = 1;
  for (const f of facts) {
    if (!urlToIdx.has(f.url)) {
      urlToIdx.set(f.url, idx);
      sourceMap.set(idx, { url: f.url, title: f.title, klass: f.klass });
      idx++;
    }
  }
  state.sourceMap = sourceMap;

  const lines: string[] = [];
  lines.push("# QUELLEN");
  for (const [i, src] of sourceMap.entries()) {
    lines.push(`[${i}] (${src.klass}) ${src.title ?? ""} — ${src.url}`);
  }
  lines.push("\n# FAKTEN");
  for (const f of facts) {
    const sIdx = urlToIdx.get(f.url) ?? 0;
    const valStr =
      typeof f.value === "object"
        ? JSON.stringify(f.value).substring(0, 800)
        : String(f.value).substring(0, 400);
    lines.push(`- [${sIdx}] ${f.field}: ${valStr}${f.asOf ? ` (asOf=${f.asOf})` : ""}`);
  }
  state.context = lines.join("\n").substring(0, 60_000);
  logRun(state.runId, "info", `[context] ${sourceMap.size} Quellen, ${facts.length} Fakten`);
}

// -----------------------------------------------------------
// Step 3: extractFacts (LLM)
// -----------------------------------------------------------
interface ExtractorOutput {
  company_name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  key_metrics: Partial<KeyMetrics>;
  facts?: Array<{ field: string; value: unknown; sourceIdx: number }>;
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
  state.identity = {
    company_name: data.company_name ?? "",
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
  state.keyMetrics = km;
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

export async function stepAnswerSections(state: PipelineState): Promise<void> {
  const blockResults = await runWithConcurrency(SECTION_BLOCKS as unknown as Array<typeof SECTION_BLOCKS[number]>, 2, async (block) => {
    const { data } = await chatJSON<BlockResult>({
      runId: state.runId,
      step: `section_${block.id}`,
      model: state.modelScoring,
      system: SECTION_SYSTEM,
      user: SECTION_USER({ id: block.id, label: block.label }, state.ticker, state.context ?? ""),
      temperature: 0.2,
      artifactsDir: state.rawDir,
    });
    return data;
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
  state.confidence = lowCount > highCount ? "low" : highCount >= confidences.length / 2 ? "high" : "medium";

  // Category Heuristik (research.md §20) — vereinfacht für MVP
  let category: Category = "Transitional";
  if (state.hardBlockers.length > 0) category = "Too Hard";
  else if (state.scoreTotal >= 80 && state.confidence !== "low") category = "Rocket";
  else if (state.scoreTotal >= 65) category = "Quality Growth";
  else if (state.scoreTotal < 40) category = "Ignore";
  state.category = category;

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
// Step 7: persist
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
    };
  });

  const reportData: Report = ReportSchema.parse({
    ticker: state.ticker,
    company_name: state.identity?.company_name ?? "",
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
    moat_assessment: { rating: "Unknown", sources: [], evidence: [], threats: [] },
    catalysts: state.thesis?.catalysts ?? [],
    red_flags: [],
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
  const m = await pickDefaultModel();
  return { extract: m, scoring: m, summary: m };
}
