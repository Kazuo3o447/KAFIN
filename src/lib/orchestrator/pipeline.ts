/**
 * Pipeline-Runner. Führt die Steps aus, wobei Extract & Sections parallel laufen.
 * aktualisiert `runs`-Tabelle und sendet Events über `events.ts`.
 */
import path from "node:path";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { emitRun, logRun } from "./events";
import {
  stepFetchBaseData,
  stepDeriveMetrics,
  stepBuildContext,
  stepExtractFacts,
  stepAnswerSections,
  stepComputeScoreAndGate,
  stepSummarize,
  stepRedTeam,
  stepComputeFairValue,
  stepGenerateVerdict,
  stepComputePeerPercentiles,
  stepPersist,
  resolveModels,
  type PipelineState,
} from "./steps";
import { getLLMConfig } from "@/lib/llm/config";

const DATA_DIR = process.env.DATA_DIR || "./data";

// Sequentielle Steps vor dem parallelen LLM-Block
const PRE_STEPS: Array<{ key: string; label: string; pct: number; fn: (s: PipelineState) => Promise<unknown> }> = [
  { key: "fetch", label: "Datenquellen abrufen", pct: 15, fn: stepFetchBaseData },
  { key: "metrics", label: "Kennzahlen deterministisch berechnen", pct: 22, fn: stepDeriveMetrics },
  { key: "context", label: "Kontext aufbauen", pct: 30, fn: stepBuildContext },
];

// Sequentielle Steps nach dem parallelen LLM-Block
const POST_STEPS: Array<{ key: string; label: string; pct: number; fn: (s: PipelineState) => Promise<unknown> }> = [
  { key: "score",       label: "Scoring & Gate",                   pct: 70, fn: stepComputeScoreAndGate },
  { key: "peer",        label: "Peer-Percentile-Analyse",          pct: 75, fn: stepComputePeerPercentiles },
  { key: "fair_value",  label: "Fair-Value-Berechnung",            pct: 78, fn: stepComputeFairValue },
  { key: "summary",     label: "Zusammenfassung (LLM)",            pct: 86, fn: stepSummarize },
  { key: "redteam",     label: "Red-Team-Prüfung (LLM, bedingt)", pct: 92, fn: stepRedTeam },
  { key: "verdict",     label: "Verdict-Generation (LLM)",         pct: 96, fn: stepGenerateVerdict },
  { key: "persist",     label: "Persistieren",                     pct: 100, fn: stepPersist },
];

export interface StartRunInput {
  runId: string;
  ticker: string;
  modelOverride?: { extract?: string; scoring?: string; summary?: string };
}

export async function runPipeline(input: StartRunInput): Promise<void> {
  const ticker = input.ticker.trim().toUpperCase();
  const runDate = new Date().toISOString().slice(0, 10);
  const rawDir = path.join(DATA_DIR, "raw", ticker, input.runId);

  // Alle Fehler — auch frühzeitige wie "Ollama nicht erreichbar" — als Error-Event senden
  try {
    const defaults = await resolveModels();
    const state: PipelineState = {
      runId: input.runId,
      ticker,
      runDate,
      modelExtract: input.modelOverride?.extract ?? defaults.extract,
      modelScoring: input.modelOverride?.scoring ?? defaults.scoring,
      modelSummary: input.modelOverride?.summary ?? defaults.summary,
      rawDir,
    };

    // DB: started → running
    db.update(schema.runs)
      .set({ status: "running", startedAt: Date.now() })
      .where(eq(schema.runs.id, input.runId))
      .run();

    logRun(input.runId, "info", `[pipeline] start ticker=${ticker} models=${state.modelExtract}`);
    emitRun(input.runId, "progress", { pct: 0 });

    // Helper: einen benannten Step laufen lassen + Events senden
    async function runStep(step: { key: string; label: string; pct: number; fn: (s: PipelineState) => Promise<unknown> }) {
      emitRun(input.runId, "step:start", { step: step.key, label: step.label });
      const t0 = Date.now();
      await step.fn(state);
      const ms = Date.now() - t0;
      emitRun(input.runId, "step:done", { step: step.key, ms, ok: true });
      emitRun(input.runId, "progress", { pct: step.pct });
      db.update(schema.runs).set({ progress: step.pct }).where(eq(schema.runs.id, input.runId)).run();
    }

    // Phase 1: sequentielle Vorbereitung
    for (const step of PRE_STEPS) await runStep(step);

    // Phase 2: LLM-Phase
    // DeepSeek kann parallel laufen; Ollama bleibt bewusst sequentiell,
    // damit keine Warteschlange >300s entsteht (führt sonst zu "fetch failed").
    if (getLLMConfig().provider === "deepseek") {
      emitRun(input.runId, "step:start", { step: "extract", label: "Fakten extrahieren (LLM)" });
      emitRun(input.runId, "step:start", { step: "sections", label: "Blöcke A–G bewerten (LLM)" });
      const t0LLM = Date.now();
      await Promise.all([
        stepExtractFacts(state).then(() => {
          emitRun(input.runId, "step:done", { step: "extract", ms: Date.now() - t0LLM, ok: true });
          logRun(input.runId, "info", `[pipeline] extract done (${Date.now() - t0LLM}ms)`);
        }),
        stepAnswerSections(state).then(() => {
          emitRun(input.runId, "step:done", { step: "sections", ms: Date.now() - t0LLM, ok: true });
          logRun(input.runId, "info", `[pipeline] sections done (${Date.now() - t0LLM}ms)`);
        }),
      ]);
      emitRun(input.runId, "progress", { pct: 70 });
      db.update(schema.runs).set({ progress: 70 }).where(eq(schema.runs.id, input.runId)).run();
    } else {
      await runStep({ key: "extract", label: "Fakten extrahieren (LLM)", pct: 40, fn: stepExtractFacts });
      await runStep({ key: "sections", label: "Blöcke A–G bewerten (LLM)", pct: 70, fn: stepAnswerSections });
    }

    // Phase 3: sequentielle Nachverarbeitung
    for (const step of POST_STEPS) await runStep(step);

    // Done
    db.update(schema.runs)
      .set({ status: "done", finishedAt: Date.now(), reportId: state.reportId, progress: 100 })
      .where(eq(schema.runs.id, input.runId))
      .run();

    emitRun(input.runId, "done", {
      reportId: state.reportId!,
      gate: state.gate!,
      scoreTotal: state.scoreTotal!,
    });
    logRun(input.runId, "info", `[pipeline] done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logRun(input.runId, "error", `[pipeline] FAILED ${msg}`);
    emitRun(input.runId, "error", { msg });
    db.update(schema.runs)
      .set({ status: "failed", finishedAt: Date.now(), error: msg })
      .where(eq(schema.runs.id, input.runId))
      .run();
  }
}
