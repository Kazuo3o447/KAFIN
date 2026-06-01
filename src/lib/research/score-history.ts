import { db, schema } from "@/lib/storage/db";
import { desc, eq } from "drizzle-orm";

export type ScoreTrend = "up" | "down" | "flat";

export interface ScoreHistoryPoint {
  reportId: string;
  researchDate: string;
  scoreTotal: number;
  gate: string;
  confidence: string;
  createdAt: number;
  deltaFromPrevious: number | null;
  trend: ScoreTrend;
}

export function deriveScoreTrend(current: number, previous?: number | null): { deltaFromPrevious: number | null; trend: ScoreTrend } {
  if (typeof previous !== "number") return { deltaFromPrevious: null, trend: "flat" };
  const delta = Math.round(current - previous);
  if (delta >= 5) return { deltaFromPrevious: delta, trend: "up" };
  if (delta <= -5) return { deltaFromPrevious: delta, trend: "down" };
  return { deltaFromPrevious: delta, trend: "flat" };
}

export function loadScoreHistory(ticker: string, limit = 12): ScoreHistoryPoint[] {
  const rows = db
    .select()
    .from(schema.scoreHistory)
    .where(eq(schema.scoreHistory.ticker, ticker.toUpperCase()))
    .orderBy(desc(schema.scoreHistory.researchDate), desc(schema.scoreHistory.createdAt))
    .limit(limit)
    .all();

  return rows
    .map((row) => ({
      reportId: row.reportId,
      researchDate: row.researchDate,
      scoreTotal: row.scoreTotal,
      gate: row.gate,
      confidence: row.confidence,
      createdAt: row.createdAt,
      deltaFromPrevious: row.deltaFromPrevious,
      trend: row.trend as ScoreTrend,
    }))
    .reverse();
}

export function loadLatestScore(ticker: string): number | null {
  const row = db
    .select({ scoreTotal: schema.scoreHistory.scoreTotal })
    .from(schema.scoreHistory)
    .where(eq(schema.scoreHistory.ticker, ticker.toUpperCase()))
    .orderBy(desc(schema.scoreHistory.researchDate), desc(schema.scoreHistory.createdAt))
    .limit(1)
    .get();
  return row?.scoreTotal ?? null;
}

export function persistScoreHistoryEntry(entry: {
  reportId: string;
  ticker: string;
  researchDate: string;
  scoreTotal: number;
  gate: string;
  confidence: string;
}): { deltaFromPrevious: number | null; trend: ScoreTrend } {
  const previousScore = loadLatestScore(entry.ticker);
  const change = deriveScoreTrend(entry.scoreTotal, previousScore);
  db.insert(schema.scoreHistory)
    .values({
      reportId: entry.reportId,
      ticker: entry.ticker.toUpperCase(),
      researchDate: entry.researchDate,
      scoreTotal: entry.scoreTotal,
      gate: entry.gate,
      confidence: entry.confidence,
      createdAt: Date.now(),
      deltaFromPrevious: change.deltaFromPrevious,
      trend: change.trend,
    })
    .onConflictDoUpdate({
      target: schema.scoreHistory.reportId,
      set: {
        ticker: entry.ticker.toUpperCase(),
        researchDate: entry.researchDate,
        scoreTotal: entry.scoreTotal,
        gate: entry.gate,
        confidence: entry.confidence,
        deltaFromPrevious: change.deltaFromPrevious,
        trend: change.trend,
      },
    })
    .run();
  return change;
}
