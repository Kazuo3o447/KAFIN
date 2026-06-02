/**
 * Pipeline-Runner. Führt die Steps aus, wobei Extract & Sections parallel laufen.
 * aktualisiert `runs`-Tabelle und sendet Events über `events.ts`.
 */
import path from "node:path";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { emitRun, logRun } from "./events";
import { STEP_MANIFEST } from "./step-manifest";
import {
  stepFetchBaseData,
  stepDeriveMetrics,
  stepNormalizeDataset,
  stepBuildContext,
  stepExtractFacts,
  stepAnswerSections,
  stepComputeScoreAndGate,
  stepComputeTimingAxis,
  stepInterpretAnalyst,
  stepComputeFairValue,
  stepComputeTradeSetup,
  stepGenerateVerdict,
  stepComputePeerPercentiles,
  stepPersist,
  resolveModels,
  type PipelineState,
} from "./steps";

const DATA_DIR = process.env.DATA_DIR || "./data";

// Step-Funktionen — geordnet nach STEP_MANIFEST. Manifest ist kanonische Quelle für keys/labels/pct.
type StepFn = (s: PipelineState) => Promise<unknown>;
const STEP_FNS: Record<string, StepFn> = {
  fetch:      stepFetchBaseData,
  normalize:  stepNormalizeDataset,
  metrics:    stepDeriveMetrics,
  context:    stepBuildContext,
  extract:    stepExtractFacts,
  sections:   stepAnswerSections,
  score:      stepComputeScoreAndGate,
  timing:     stepComputeTimingAxis,
  peer:       stepComputePeerPercentiles,
  fair_value: stepComputeFairValue,
  trade_setup:stepComputeTradeSetup,
  analyst:    stepInterpretAnalyst,
  verdict:    stepGenerateVerdict,
  persist:    stepPersist,
};

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
      effectiveModels: { scoring: {} },
      llmCalls: [],
      auditEvents: [],
      invalidSourceRefs: [],
    };

    // DB: started → running
    db.update(schema.runs)
      .set({ status: "running", startedAt: Date.now() })
      .where(eq(schema.runs.id, input.runId))
      .run();

    logRun(input.runId, "info", `[pipeline] start ticker=${ticker} models=${state.modelExtract}`);
    emitRun(input.runId, "progress", { pct: 0 });

    // Helper: einen benannten Step laufen lassen + Events senden
    async function runStep(key: string): Promise<void> {
      const meta = STEP_MANIFEST.find((s) => s.key === key);
      if (!meta) throw new Error(`Unknown step key: ${key}`);
      const fn = STEP_FNS[key];
      if (!fn) throw new Error(`No function registered for step: ${key}`);

      emitRun(input.runId, "step:start", { step: key, label: meta.label });
      const t0 = Date.now();
      let ok = true;
      let errMsg: string | undefined;
      try {
        await fn(state);
      } catch (err) {
        ok = false;
        errMsg = err instanceof Error ? err.message : String(err);
        logRun(input.runId, "warn", `[pipeline] step ${key} failed: ${errMsg}`);
      }
      const ms = Date.now() - t0;

      // Build optional summary for the findings panel
      let summary: string | undefined;
      if (key === "fetch") {
        const ds = state.normalizedDataset ?? state.companyDataset;
        const annualCount = ds?.annual?.length ?? 0;
        if (annualCount > 0) summary = `${annualCount} Jahresperioden geladen`;
        // Also emit meta event to populate findings panel
        const identity = ds?.identity;
        if (identity) {
          emitRun(input.runId, "meta", {
            ticker,
            companyName: identity.name,
            exchange: identity.exchange,
            currency: identity.currency,
          });
        }
      } else if (key === "normalize") {
        const ds = state.normalizedDataset ?? state.companyDataset;
        const identity = ds?.identity;
        // Emit meta after normalize when identity is more reliably populated
        if (identity?.name) {
          emitRun(input.runId, "meta", {
            ticker,
            companyName: identity.name,
            exchange: identity.exchange,
            currency: identity.currency,
          });
        }
        const annualCount = ds?.annual?.length ?? 0;
        if (annualCount > 0) summary = `${annualCount} Perioden normalisiert`;
      } else if (key === "metrics") {
        const km = state.derivedMetrics;
        if (km) {
          const parts: string[] = [];
          if (km.revenue_growth_yoy != null) parts.push(`RevYoY ${(km.revenue_growth_yoy * 100).toFixed(1)}%`);
          if (km.roic != null) parts.push(`ROIC ${(km.roic * 100).toFixed(1)}%`);
          if (km.fcf_margin != null) parts.push(`FCF-Marge ${(km.fcf_margin * 100).toFixed(1)}%`);
          if (parts.length > 0) summary = parts.join(" · ");
        }
      } else if (key === "score") {
        const sb = state.scoreBreakdown;
        if (sb && state.scoreTotal != null) {
          summary = `Score ${state.scoreTotal} · Gate ${state.gate ?? "-"}`;
        }
      }

      emitRun(input.runId, "step:done", { step: key, ms, ok, ...(summary ? { summary } : {}) });
      if (ok) {
        emitRun(input.runId, "progress", { pct: meta.pct });
        db.update(schema.runs).set({ progress: meta.pct }).where(eq(schema.runs.id, input.runId)).run();
      }
    }

    // Phase 1: sequentielle Vorbereitung
    await runStep("fetch");
    await runStep("normalize");
    await runStep("metrics");
    await runStep("context");

    // Phase 2: Extraktion + Scoring
    await runStep("extract");
    await runStep("sections");

    // Phase 3: sequentielle Nachverarbeitung
    await runStep("score");
    await runStep("timing");
    await runStep("peer");
    await runStep("fair_value");
    await runStep("trade_setup");
    await runStep("analyst");
    await runStep("verdict");
    await runStep("persist");

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
