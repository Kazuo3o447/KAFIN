import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "kafin-research",
    version: "0.1.0",
    ts: Date.now(),
  });
}
