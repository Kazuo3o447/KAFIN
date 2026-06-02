/**
 * GET /api/market/health
 * Gibt die aktuelle MarketHealth mit Risk-Posture zurück.
 * Cached TTL 30 min (Handelszeiten) / 60 min (außerhalb).
 * Query-Param ?refresh=1 invalidiert den Cache sofort.
 */
import { NextResponse } from "next/server";
import {
  fetchAndComputeMarketHealth,
  invalidateMarketHealthCache,
  getMarketHealthCache,
} from "@/lib/market/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (forceRefresh) {
    invalidateMarketHealthCache();
  }

  try {
    const health = await fetchAndComputeMarketHealth();
    return NextResponse.json(health, {
      headers: {
        "Cache-Control": "no-store",
        "X-Market-Health-Cached": forceRefresh ? "false" : String(getMarketHealthCache() !== null),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "market_health_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
