import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const row = db.select().from(schema.runs).where(eq(schema.runs.id, params.id)).get();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ run: row });
}
