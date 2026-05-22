import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { loadReport } from "@/lib/export/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readJsonlFiltered(filePath: string, runId: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const out: unknown[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { runId?: string };
      if (row.runId === runId) out.push(row);
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

function readArtifactDir(dirPath: string): Record<string, unknown> {
  if (!fs.existsSync(dirPath)) return {};
  const out: Record<string, unknown> = {};
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const p = path.join(dirPath, entry.name);
    const raw = fs.readFileSync(p, "utf8");
    try {
      out[entry.name] = JSON.parse(raw);
    } catch {
      out[entry.name] = raw;
    }
  }
  return out;
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const meta = loadReport(ctx.params.id);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const reportRow = db.select().from(schema.reports).where(eq(schema.reports.id, ctx.params.id)).get();
  if (!reportRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const logsDir = path.join(process.env.DATA_DIR || "./data", "logs");
  const runsLogPath = path.join(logsDir, "runs.jsonl");
  const auditLogPath = path.join(logsDir, "audit.jsonl");

  const rawDir = reportRow.rawDir ?? "";
  const prompts = rawDir ? readArtifactDir(path.join(rawDir, "prompts")) : {};
  const responses = rawDir ? readArtifactDir(path.join(rawDir, "responses")) : {};

  const payload = {
    exportedAt: new Date().toISOString(),
    reportId: reportRow.id,
    runId: reportRow.runId,
    ticker: reportRow.ticker,
    researchDate: reportRow.researchDate,
    models: {
      extract: reportRow.modelExtract,
      scoring: reportRow.modelScoring,
      summary: reportRow.modelSummary,
    },
    report: meta.report,
    audit: {
      runEvents: readJsonlFiltered(runsLogPath, reportRow.runId),
      llmCalls: readJsonlFiltered(auditLogPath, reportRow.runId),
      artifacts: {
        rawDir,
        prompts,
        responses,
      },
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${meta.ticker}_${meta.report.research_date}_audit.json"`,
    },
  });
}
