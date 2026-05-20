/**
 * Pipeline-Runner. Führt die 7 Steps in Reihe aus,
 * aktualisiert `runs`-Tabelle und sendet Events über `events.ts`.
 */
import path from "node:path";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { emitRun, logRun } from "./events";
import {
  stepFetchBaseData,
  stepBuildContext,
  stepExtractFacts,
  stepAnswerSections,
  stepComputeScoreAndGate,
  stepSummarize,
  stepPersist,
  resolveModels,
  type PipelineState,
} from "./steps";

const DATA_DIR = process.env.DATA_DIR || "./data";

const STEPS: Array<{ key: string; label: string; pct: number; fn: (s: PipelineState) => Promise<unknown> }> = [
  { key: "fetch", label: "Datenquellen abrufen", pct: 15, fn: stepFetchBaseData },
  { key: "context", label: "Kontext aufbauen", pct: 25, fn: stepBuildContext },
  { key: "extract", label: "Fakten extrahieren (LLM)", pct: 40, fn: stepExtractFacts },
  { key: "sections", label: "Blöcke A–G bewerten (LLM)", pct: 70, fn: stepAnswerSections },
  { key: "score", label: "Scoring & Gate", pct: 80, fn: stepComputeScoreAndGate },
  { key: "summary", label: "Zusammenfassung (LLM)", pct: 92, fn: stepSummarize },
  { key: "persist", label: "Persistieren", pct: 100, fn: stepPersist },
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

  try {
    for (const step of STEPS) {
      emitRun(input.runId, "step:start", { step: step.key, label: step.label });
      const t0 = Date.now();
      await step.fn(state);
      const ms = Date.now() - t0;
      emitRun(input.runId, "step:done", { step: step.key, ms, ok: true });
      emitRun(input.runId, "progress", { pct: step.pct });
      // Persistiere progress in DB
      db.update(schema.runs).set({ progress: step.pct }).where(eq(schema.runs.id, input.runId)).run();
    }

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
