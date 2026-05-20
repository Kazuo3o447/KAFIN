import { NextResponse } from "next/server";
import { listModels } from "@/lib/llm/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const models = await listModels();
    return NextResponse.json({
      ok: true,
      count: models.length,
      models: models.map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
        parameterSize: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
