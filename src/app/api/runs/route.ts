import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, schema } from "@/lib/storage/db";
import { runPipeline } from "@/lib/orchestrator/pipeline";
import { ensureRunBus } from "@/lib/orchestrator/events";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartBody {
  ticker: string;
  modelOverride?: { extract?: string; scoring?: string; summary?: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ticker = (body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    return NextResponse.json({ error: "invalid_ticker" }, { status: 400 });
  }

  const runId = crypto.randomUUID();
  db.insert(schema.runs)
    .values({
      id: runId,
      ticker,
      status: "queued",
      progress: 0,
      startedAt: Date.now(),
    })
    .run();

  // Bus initialisieren, damit Buffer schon vor erstem emit existiert
  ensureRunBus(runId);

  // Pipeline async starten — kein await
  void runPipeline({ runId, ticker, modelOverride: body.modelOverride }).catch(() => {
    /* Fehler werden in pipeline.ts geloggt */
  });

  return NextResponse.json({ runId, ticker, status: "queued" }, { status: 202 });
}

export async function GET(): Promise<NextResponse> {
  const rows = db
    .select()
    .from(schema.runs)
    .orderBy(desc(schema.runs.startedAt))
    .limit(50)
    .all();
  return NextResponse.json({ runs: rows });
}
