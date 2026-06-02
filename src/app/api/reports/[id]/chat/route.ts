import fs from "node:fs";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/storage/db";
import { ReportSchema } from "@/lib/schemas/report";
import { getLLMConfig } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const id = (ctx.params.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const row = db.select().from(schema.reports).where(eq(schema.reports.id, id)).get();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, chat: "available" }, { status: 200 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET,POST,OPTIONS",
    },
  });
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  focusMetric?: string;
}

const LLM_BASE_URL = (
  process.env.LLM_BASE_URL ||
  process.env.LM_STUDIO_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  "http://localhost:1234"
).replace(/\/$/, "");

function buildSystemPrompt(report: ReturnType<typeof ReportSchema.parse>, focusMetric?: string): string {
  const km = report.key_metrics;
  const fv = report.fair_value;
  const ts = report.trade_setup;

  const metricBlock = `
Ticker: ${report.ticker} | ${report.company_name ?? "-"} | ${report.exchange ?? "-"}
Datum: ${report.research_date}
Score: ${report.growth_research_score ?? "-"} / 100 | Gate: ${report.gate} | Confidence: ${report.confidence}
Aktion: ${ts.action} | Einstieg ≤ ${ts.entry_zone_max ?? "-"} | R/R ${ts.risk_reward ?? "-"} | MoS ${ts.margin_of_safety != null ? `${(ts.margin_of_safety * 100).toFixed(1)}%` : "-"}
Fair Value: ${fv?.point_estimate ?? "-"} (${fv?.range_low ?? "-"}–${fv?.range_high ?? "-"}) | Kurs: ${fv?.current_price ?? "-"} ${fv?.currency ?? ""}

Kennzahlen:
Revenue YoY: ${km.revenue_growth_yoy != null ? `${(km.revenue_growth_yoy * 100).toFixed(1)}%` : "-"}
Revenue CAGR 3Y: ${km.revenue_cagr_3y != null ? `${(km.revenue_cagr_3y * 100).toFixed(1)}%` : "-"}
ROIC: ${km.roic != null ? `${(km.roic * 100).toFixed(1)}%` : "-"}
FCF Margin: ${km.fcf_margin != null ? `${(km.fcf_margin * 100).toFixed(1)}%` : "-"}
Operating Margin: ${km.operating_margin != null ? `${(km.operating_margin * 100).toFixed(1)}%` : "-"}
EV/Sales: ${km.ev_sales ?? "-"} | NTM PE: ${km.ntm_pe ?? "-"} | PEG: ${km.peg ?? "-"}
Net Debt/EBITDA: ${km.net_debt_to_ebitda ?? "-"} | Altman Z: ${km.altman_z ?? "-"} | Piotroski F: ${km.piotroski_f ?? "-"}
Short Float: ${km.short_interest_pct_float != null ? `${(km.short_interest_pct_float * 100).toFixed(1)}%` : "-"} | DTC: ${km.days_to_cover ?? "-"}
`.trim();

  const analystBlock = report.analyst
    ? `
KI-Analyst:
These: ${report.analyst.thesis ?? "-"}
Bull: ${report.analyst.bullCase ?? "-"}
Bear: ${report.analyst.bearCase ?? "-"}
Katalysator: ${report.analyst.catalystNote ?? report.analyst.catalysts[0]?.text ?? "-"}
`.trim()
    : "KI-Analyst: nicht verfügbar";

  const verdiktBlock = report.verdict
    ? `Verdikt: ${report.verdict.label ?? "-"}\n${report.verdict.detail ?? ""}`
    : "";

  const focusBlock = focusMetric
    ? `\nDer Nutzer möchte besonders die Kennzahl / den Bereich "${focusMetric}" vertiefen.`
    : "";

  return [
    "Du bist ein präziser Finanzanalyst-Assistent für das KAFIN-System.",
    "Antworte auf Deutsch, kurz und faktenbasiert. Stütze dich auf die folgenden Analysedaten.",
    "Spekuliere nicht über Informationen, die nicht in den Daten enthalten sind.",
    focusBlock,
    "",
    "=== ANALYSE-KONTEXT ===",
    metricBlock,
    "",
    analystBlock,
    verdiktBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = (ctx.params.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const row = db.select().from(schema.reports).where(eq(schema.reports.id, id)).get();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const jsonPath = row.reportJsonPath;
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    return NextResponse.json({ error: "report_json_missing" }, { status: 404 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }

  // Validate message roles
  for (const msg of body.messages) {
    if (!["user", "assistant"].includes(msg.role) || typeof msg.content !== "string") {
      return NextResponse.json({ error: "invalid_message_format" }, { status: 400 });
    }
  }

  const report = ReportSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
  const llmConfig = getLLMConfig();
  const systemPrompt = buildSystemPrompt(report, body.focusMetric);

  // Determine model + base URL
  let apiBase = LLM_BASE_URL;
  let apiKey = "";
  let model = "";

  if (llmConfig.provider === "deepseek") {
    apiBase = "https://api.deepseek.com";
    apiKey = llmConfig.deepseekApiKey;
    model = llmConfig.deepseekModel || "deepseek-chat";
  } else if (llmConfig.provider === "groq") {
    apiBase = "https://api.groq.com/openai";
    apiKey = llmConfig.groqApiKey;
    model = llmConfig.groqModel || "meta-llama/llama-4-scout-17b-16e-instruct";
  } else {
    // lmstudio — pick the first available model
    try {
      const modelsRes = await fetch(`${apiBase}/v1/models`, { cache: "no-store" });
      if (modelsRes.ok) {
        const modelsJson = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
        const first = modelsJson.data?.[0]?.id;
        if (first) model = first;
      }
    } catch {
      // ignore — will fail gracefully at completion call
    }
    if (!model) model = "local-model";
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "llm_unreachable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json({ error: "llm_error", detail: text }, { status: 502 });
  }

  if (!upstream.body) {
    return NextResponse.json({ error: "no_stream_body" }, { status: 502 });
  }

  // Pipe the upstream SSE stream straight to the client
  const responseStream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          // Check for stream termination signal
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.includes("data: [DONE]")) break;
        }
      } catch {
        // client disconnected
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
