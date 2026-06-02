import { chatJSON } from "@/lib/llm/ollama";
import { getLLMConfig } from "@/lib/llm/config";
import {
  SUMMARY_SYSTEM,
  SUMMARY_USER,
  REDTEAM_SYSTEM,
  REDTEAM_USER,
  KI_AXIS_SYSTEM,
  KI_AXIS_USER,
} from "@/lib/llm/prompts";
import type { Report } from "@/lib/schemas/report";
import type { AnalystEvidencePackage } from "@/lib/analyst/evidence";
import { applyAnalystGuardrails, sanitizeKiAxisJudgment, verifyKiAxisJudgment } from "@/lib/analyst/guardrails";
import type { KiAxisJudgment } from "@/lib/analyst/guardrails";
import type { AxisKey, AxisResult } from "@/lib/scoring/axes";
import { THRESHOLDS } from "@/lib/research/thresholds";

export interface AnalystBlock {
  isInterpretation: true;
  thesis: string;
  numbersSay: string;
  bullCase: string;
  bearCase: string;
  catalystNote: string;
  entryTrigger: string;
  exitWatchTrigger: string;
  catalysts: Array<{
    text: string;
    anchorMetric: string | null;
    status: "confirmed" | "speculative";
    sourceUrl: string | null;
    sourceDate: string | null;
  }>;
  chartReading: string;
  groundingFacts: string[];
  model: { name: string; version: string | null; ranAt: string };
}

export interface InterpretOptions {
  runId: string;
  artifactsDir?: string;
  model?: string;
  redTeamModel?: string;
  enabled?: boolean;
}

interface InterpretDraft {
  thesis: string;
  numbersSay: string;
  bullCase: string;
  bearCase: string;
  catalystNote: string;
  entryTrigger: string;
  exitWatchTrigger: string;
  chartReading: string;
  catalysts: Array<{
    text: string;
    anchorMetric?: string | null;
    sourceUrl?: string | null;
    sourceDate?: string | null;
  }>;
}

interface RedTeamDraft {
  bearCounterpoints: string[];
}

function modelVersion(model: string): string | null {
  const parts = model.split(":");
  if (parts.length > 1) return parts.slice(1).join(":");
  return null;
}

function hasProviderConfig(): boolean {
  const cfg = getLLMConfig();
  if (cfg.provider === "deepseek") return cfg.deepseekApiKey.length > 0;
  if (cfg.provider === "groq") return cfg.groqApiKey.length > 0;
  return true;
}

export async function interpretReport(
  report: Readonly<Report>,
  evidence: AnalystEvidencePackage,
  opts: InterpretOptions,
): Promise<AnalystBlock | null> {
  const enabledByDefault = opts.enabled ?? process.env.ENABLE_ANALYST_LLM !== "0";
  if (!enabledByDefault) return null;
  if (!hasProviderConfig()) return null;

  const model = opts.model ?? process.env.LLM_MODEL ?? process.env.ANALYST_MODEL ?? "";
  if (!model) return null;

  try {
    const summary = await chatJSON<InterpretDraft>({
      runId: opts.runId,
      step: "analyst_interpret",
      model,
      system: SUMMARY_SYSTEM,
      user: SUMMARY_USER(report.ticker, report.category, report.growth_research_score ?? 0, JSON.stringify({ report, evidence })),
      temperature: 0.15,
      artifactsDir: opts.artifactsDir,
    });

    let bearCase = summary.data.bearCase ?? "";
    const redTeamModel = opts.redTeamModel ?? model;
    try {
      const rt = await chatJSON<RedTeamDraft>({
        runId: opts.runId,
        step: "analyst_redteam",
        model: redTeamModel,
        system: REDTEAM_SYSTEM,
        user: REDTEAM_USER(
          report.ticker,
          report.category,
          report.growth_research_score ?? 0,
          [summary.data.bullCase ?? ""],
          JSON.stringify(evidence.deterministicSignals),
          JSON.stringify({ report, evidence }),
        ),
        temperature: 0.15,
        artifactsDir: opts.artifactsDir,
      });
      if (rt.data.bearCounterpoints?.length) {
        bearCase = [bearCase, ...rt.data.bearCounterpoints].filter(Boolean).join(" ");
      }
    } catch {
      // Optional red-team pass
    }

    const guarded = applyAnalystGuardrails(report, {
      thesis: summary.data.thesis ?? "",
      numbersSay: summary.data.numbersSay ?? "",
      bullCase: summary.data.bullCase ?? "",
      bearCase,
      catalystNote: summary.data.catalystNote ?? "",
      entryTrigger: summary.data.entryTrigger ?? "",
      exitWatchTrigger: summary.data.exitWatchTrigger ?? "",
      chartReading: summary.data.chartReading ?? "",
      catalysts: summary.data.catalysts ?? [],
    });

    const enrichedCatalysts = guarded.catalysts.map((c, idx) => {
      const draft = summary.data.catalysts?.[idx];
      const fallback = evidence.filingsAndNews[idx] ?? evidence.filingsAndNews[0] ?? null;
      return {
        ...c,
        sourceUrl: draft?.sourceUrl ?? fallback?.source ?? null,
        sourceDate: draft?.sourceDate ?? fallback?.asOf ?? null,
      };
    });

    return {
      isInterpretation: true,
      thesis: guarded.thesis,
      numbersSay: guarded.numbersSay,
      bullCase: guarded.bullCase,
      bearCase: guarded.bearCase,
      catalystNote: guarded.catalystNote,
      entryTrigger: guarded.entryTrigger,
      exitWatchTrigger: guarded.exitWatchTrigger,
      catalysts: enrichedCatalysts,
      chartReading: guarded.chartReading,
      groundingFacts: guarded.groundingFacts,
      model: {
        name: summary.effectiveModel,
        version: modelVersion(summary.effectiveModel),
        ranAt: new Date().toISOString(),
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// P2: KI Axis Judgment (Mauboussin moat + Bull/Bear debate)
// ---------------------------------------------------------------------------

/** Options forwarded to judgeAxis / interpretAxes */
export interface AxisJudgeOptions {
  runId: string;
  model?: string;
  artifactsDir?: string;
  enabled?: boolean;
}

/**
 * Calls the LLM to produce a KiAxisJudgment for a single axis.
 * Returns null if KI is disabled, model is missing, or LLM fails.
 */
export async function judgeAxis(
  axis: AxisKey,
  quant: AxisResult["quant"],
  report: Readonly<Report>,
  evidence: AnalystEvidencePackage,
  opts: AxisJudgeOptions,
): Promise<KiAxisJudgment | null> {
  const enabled = opts.enabled ?? process.env.ENABLE_ANALYST_LLM !== "0";
  if (!enabled) return null;
  const model = opts.model ?? process.env.LLM_MODEL ?? process.env.ANALYST_MODEL ?? "";
  if (!model) return null;

  const deterministicSummary = JSON.stringify(evidence.deterministicSignals ?? {});
  const evidenceContext = evidence.filingsAndNews
    .slice(0, 6)
    .map((f, i) => `[${i + 1}] (${f.asOf}) ${f.title}: ${f.summary.slice(0, 300)}`)
    .join("\n");

  try {
    const result = await chatJSON<unknown>({
      runId: opts.runId,
      step: `ki_axis_${axis}`,
      model,
      system: KI_AXIS_SYSTEM,
      user: KI_AXIS_USER(report.ticker, axis, quant.value, quant.coverage, deterministicSummary, evidenceContext),
      temperature: 0.2,
      artifactsDir: opts.artifactsDir,
    });

    const raw = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
    const judgment = sanitizeKiAxisJudgment({ ...raw, axis });
    if (!judgment) return null;

    // Verifier: log hit-rate but do not block (used for observability)
    const verifier = verifyKiAxisJudgment(report, judgment);
    // Penalise confidence if grounding is weak
    if (verifier.totalClaims > 0 && verifier.hitRate < 0.5) {
      judgment.confidence = judgment.confidence * verifier.hitRate;
    }

    return judgment;
  } catch {
    return null;
  }
}

/**
 * Runs KI axis judgment for all axes and merges results into the AxisResult array.
 * Mutates a copy of each AxisResult to populate the .ki field and recompute .combined.
 */
export async function interpretAxes(
  axes: AxisResult[],
  report: Readonly<Report>,
  evidence: AnalystEvidencePackage,
  opts: AxisJudgeOptions,
): Promise<AxisResult[]> {
  const updated: AxisResult[] = [];

  const kiWeightMaxByAxis: Record<AxisKey, number> = {
    growth: THRESHOLDS.axis_ki_weight_max_growth,
    finance: THRESHOLDS.axis_ki_weight_max_finance,
    moat: THRESHOLDS.axis_ki_weight_max_moat,
  };

  for (const axisResult of axes) {
    const judgment = await judgeAxis(axisResult.axis, axisResult.quant, report, evidence, opts);

    if (!judgment || axisResult.quant.value === null) {
      updated.push(axisResult);
      continue;
    }

    const kiWeightMax = kiWeightMaxByAxis[axisResult.axis];
    // Scale effective weight by confidence (evidence groundedness already folded in above)
    const kiWeightEffective = kiWeightMax * judgment.confidence;

    const kiSubScore: AxisResult["ki"] = {
      value: judgment.ki_subscore,
      coverage: judgment.evidence.length > 0 ? Math.min(1, judgment.evidence.length / 3) : 0,
      inputs: judgment.evidence.map((e) => e.sourceRef),
      source: "ki",
    };

    const combined =
      (1 - kiWeightEffective) * axisResult.quant.value + kiWeightEffective * judgment.ki_subscore;

    const divergence =
      axisResult.quant.value !== null
        ? Math.abs(judgment.ki_subscore - axisResult.quant.value)
        : null;

    updated.push({
      ...axisResult,
      ki: kiSubScore,
      combined,
      divergence,
      kiWeightEffective,
      rating: judgment.rating,
    });
  }

  return updated;
}
