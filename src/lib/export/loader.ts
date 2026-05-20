/**
 * Hilfsfunktion: Lädt Report aus DB+JSON und liefert das geparste Schema.
 */
import fs from "node:fs";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { ReportSchema, type Report } from "@/lib/schemas/report";

export interface ReportWithMeta {
  reportId: string;
  ticker: string;
  jsonPath: string;
  mdPath: string | null;
  report: Report;
}

export function loadReport(reportId: string): ReportWithMeta | null {
  const row = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.id, reportId))
    .get();
  if (!row || !row.reportJsonPath || !fs.existsSync(row.reportJsonPath)) return null;
  const raw = fs.readFileSync(row.reportJsonPath, "utf8");
  const report = ReportSchema.parse(JSON.parse(raw));
  return {
    reportId,
    ticker: row.ticker,
    jsonPath: row.reportJsonPath,
    mdPath: row.reportMdPath ?? null,
    report,
  };
}
