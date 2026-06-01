import fs from "node:fs";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/storage/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const id = (ctx.params.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const report = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.id, id))
    .get();

  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (report.reportJsonPath && fs.existsSync(report.reportJsonPath)) {
    fs.unlinkSync(report.reportJsonPath);
  }
  if (report.reportMdPath && fs.existsSync(report.reportMdPath)) {
    fs.unlinkSync(report.reportMdPath);
  }

  db.delete(schema.sources).where(eq(schema.sources.reportId, id)).run();
  db.delete(schema.peerMetrics).where(eq(schema.peerMetrics.reportId, id)).run();
  db.delete(schema.scoreHistory).where(eq(schema.scoreHistory.reportId, id)).run();

  db.update(schema.watchlist)
    .set({ lastReportId: null })
    .where(eq(schema.watchlist.lastReportId, id))
    .run();

  db.update(schema.runs)
    .set({ reportId: null })
    .where(eq(schema.runs.reportId, id))
    .run();

  db.delete(schema.reports).where(eq(schema.reports.id, id)).run();

  return NextResponse.json({ ok: true, id });
}
