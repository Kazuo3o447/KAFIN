import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/storage/db";
import { eq } from "drizzle-orm";
import { invalidateLLMConfigCache } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings          → alle Settings als {key: value}
 *  GET /api/settings?key=foo  → einzelner Wert { key, value }
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    const value = row ? parseValue(row.value) : null;
    return NextResponse.json({ key, value });
  }
  const rows = db.select().from(schema.settings).all();
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = parseValue(row.value);
  return NextResponse.json(out);
}

/** POST /api/settings  { key, value } → upsert */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { key?: string; value?: unknown };
  try {
    body = (await req.json()) as { key?: string; value?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.key || typeof body.key !== "string") {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  // API-Key-Wert darf kein Leerzeichen am Rand haben
  const value =
    typeof body.value === "string" ? body.value.trim() : body.value;

  db.insert(schema.settings)
    .values({ key: body.key, value: JSON.stringify(value), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: JSON.stringify(value), updatedAt: Date.now() },
    })
    .run();

  // LLM-Konfigurations-Cache invalidieren wenn Provider-Einstellungen geändert wurden
  if (body.key.startsWith("llm_") || body.key.startsWith("deepseek_")) {
    invalidateLLMConfigCache();
  }

  return NextResponse.json({ ok: true });
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
