import { chatJSON } from "@/lib/llm/ollama";
import { getLLMConfig } from "@/lib/llm/config";
import {
  SUMMARY_SYSTEM,
  SUMMARY_USER,
  REDTEAM_SYSTEM,
  REDTEAM_USER,
} from "@/lib/llm/prompts";
import type { Report } from "@/lib/schemas/report";
import type { AnalystEvidencePackage } from "@/lib/analyst/evidence";
import { applyAnalystGuardrails } from "@/lib/analyst/guardrails";

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
