/**
 * Watchlist-API.
 *  - GET    /api/watchlist          → alle Pins
 *  - POST   /api/watchlist          → { ticker, notes?, lastReportId? } pin/upsert
 *  - DELETE /api/watchlist?ticker=X → unpin
 */
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTicker(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const v = t.trim().toUpperCase();
  if (!v || v.length > 16 || !/^[A-Z0-9.\-]+$/.test(v)) return null;
  return v;
}

export async function GET() {
  const items = db.select().from(schema.watchlist).all();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const ticker = normalizeTicker(obj.ticker);
  if (!ticker) {
    return NextResponse.json({ error: "invalid_ticker" }, { status: 400 });
  }
  const notes = typeof obj.notes === "string" ? obj.notes.slice(0, 500) : null;
  const lastReportId = typeof obj.lastReportId === "string" ? obj.lastReportId : null;

  const existing = db
    .select()
    .from(schema.watchlist)
    .where(eq(schema.watchlist.ticker, ticker))
    .get();

  if (existing) {
    db.update(schema.watchlist)
      .set({
        notes: notes ?? existing.notes,
        lastReportId: lastReportId ?? existing.lastReportId,
      })
      .where(eq(schema.watchlist.ticker, ticker))
      .run();
    return NextResponse.json({ ok: true, ticker, updated: true });
  }

  db.insert(schema.watchlist)
    .values({
      ticker,
      addedAt: Date.now(),
      notes,
      lastReportId,
    })
    .run();
  return NextResponse.json({ ok: true, ticker, created: true });
}

export async function DELETE(req: NextRequest) {
  const ticker = normalizeTicker(req.nextUrl.searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json({ error: "invalid_ticker" }, { status: 400 });
  }
  const res = db
    .delete(schema.watchlist)
    .where(eq(schema.watchlist.ticker, ticker))
    .run();
  return NextResponse.json({ ok: true, ticker, deleted: res.changes > 0 });
}
