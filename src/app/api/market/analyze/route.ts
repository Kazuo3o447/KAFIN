/**
 * POST /api/market/analyze
 * KI-Marktanalyse: füttert vollständigen MarketHealth-Kontext + Quotes + Momentum
 * an das konfigurierte LLM und gibt einen Streaming-Text-Brief zurück.
 *
 * Erster Aufruf (messages=[]) → erzeugt einen Regime-Brief.
 * Folgeaufrufe (messages≥1) → Chat über den Marktkontext.
 *
 * Guardrails erben vom Report-Chat:
 *   - Geerdet im MarketHealth-Kontext
 *   - Keine erfundenen Zahlen (nur Werte aus Kontext oder als Schätzung markiert)
 *   - Chain-of-Thought wenn unklar
 *   - Quellenpflicht bei faktischen Aussagen
 *
 * Modell-Routing wie Bestand (llm/config.ts).
 */
import { NextResponse } from "next/server";
import {
  fetchAndComputeMarketHealth,
  setMarketHealthCache,
  type MarketHealth,
} from "@/lib/market/health";
import { getLLMConfig } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnalyzeRequest {
  asOf?: string;
  messages?: ChatMessage[];
}

const LLM_BASE_URL = (
  process.env.LLM_BASE_URL ||
  process.env.LM_STUDIO_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  "http://localhost:1234"
).replace(/\/$/, "");

function buildMarketSystemPrompt(health: MarketHealth): string {
  const { pillars, rates, factor, divergences, quotes } = health;

  const quote = (label: string, symbol: string) => {
    const q = quotes.find((x) => x.symbol === symbol);
    if (!q || q.price === null) return `${label}: n/v`;
    const d = q.change1dPct != null ? ` (${q.change1dPct >= 0 ? "+" : ""}${q.change1dPct.toFixed(2)}%)` : "";
    return `${label}: ${q.price.toFixed(q.category === "index" ? 0 : 2)}${d}`;
  };

  const pctFmt = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "n/v");
  const numFmt = (v: number | null, d = 2) => (v != null ? v.toFixed(d) : "n/v");

  const quotesBlock = [
    "=== QUOTES ===",
    quote("S&P 500", "^GSPC"),
    quote("Nasdaq", "^IXIC"),
    quote("Russell 2000", "^RUT"),
    quote("10Y Yield", "^TNX"),
    quote("VIX", "^VIX"),
    quote("MOVE (Proxy)", "^MOVE"),
    quote("Gold", "GC=F"),
    quote("WTI", "CL=F"),
    quote("DXY", "DX-Y.NYB"),
    quote("Bitcoin", "BTC-USD"),
  ].join("\n");

  const postureBlock = [
    "=== MARKT-POSTURE ===",
    `Posture: ${health.posture.toUpperCase()} | Score: ${health.score}/100 | as_of: ${health.asOf}`,
    `Säulen-Übereinstimmung: ${health.pillarAgreement}/3`,
    `Vol-Säule: ${pillars.volatility.state} (${pillars.volatility.subscore})  ` +
      `VIX: ${numFmt(pillars.volatility.inputs["vix"] as number | null)} ` +
      `MOVE: ${numFmt(pillars.volatility.inputs["move"] as number | null)}`,
    `Credit-Säule: ${pillars.credit.state} (${pillars.credit.subscore})  ` +
      `HY-Spread: ${numFmt(pillars.credit.inputs["hySpread"] as number | null)} ` +
      `z1y: ${numFmt(pillars.credit.inputs["hyZ1y"] as number | null)}`,
    `Breadth-Säule: ${pillars.breadth.state} (${pillars.breadth.subscore})  ` +
      `%>MA200: ${pctFmt(pillars.breadth.inputs["pctAboveMa200"] as number | null)}`,
  ].join("\n");

  const ratesBlock = [
    "=== ZINSEN & DURATION ===",
    `10Y nominal: ${numFmt(rates.tenY)}%  Real: ${numFmt(rates.realTenY)}%  Kurve (10Y-2Y): ${numFmt(rates.curve10y2y)}bp  ERP: ${numFmt(rates.erp)}%`,
  ].join("\n");

  const factorBlock = [
    "=== FAKTOR-REGIME ===",
    `Growth vs. Value: ${factor.growthVsValueTrend}  Zyklisch vs. Defensiv: ${factor.cyclicalVsDefensive}`,
  ].join("\n");

  const divBlock =
    divergences.length > 0
      ? ["=== DIVERGENZEN ===", ...divergences.map((d) => `⚠ ${d}`)].join("\n")
      : "";

  return [
    "Du bist ein präziser Marktanalyst für das KAFIN-System.",
    "Antworte auf Deutsch. Stütze dich ausschließlich auf den bereitgestellten Marktkontext.",
    "Wenn Daten fehlen (n/v), weise darauf hin und spekuliere nicht.",
    "Guardrails: (1) keine erfundenen Zahlen, (2) Chain-of-Thought bei Unklarheit,",
    "(3) Unterscheide zwischen Fakten aus dem Kontext und eigener Einschätzung.",
    "Der Markt sagt *wie viel und wann*, nicht *ob ein Geschäft gut ist*.",
    "",
    quotesBlock,
    "",
    postureBlock,
    "",
    ratesBlock,
    "",
    factorBlock,
    divBlock ? `\n${divBlock}` : "",
    "",
    "Beispielfragen die der Nutzer stellen könnte:",
    "- Was würde die Posture kippen?",
    "- Was bedeutet das für Growth-Sizing?",
    "- Wo sind die größten Risiken im aktuellen Tape?",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const messages = body.messages ?? [];

  // Validate messages
  for (const msg of messages) {
    if (!["user", "assistant"].includes(msg.role) || typeof msg.content !== "string") {
      return NextResponse.json({ error: "invalid_message_format" }, { status: 400 });
    }
  }

  let health: MarketHealth;
  try {
    health = await fetchAndComputeMarketHealth();
  } catch (err) {
    return NextResponse.json(
      { error: "market_health_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  const llmConfig = getLLMConfig();
  const systemPrompt = buildMarketSystemPrompt(health);

  // Initial brief prompt if no messages provided
  const initialPrompt =
    messages.length === 0
      ? "Erstelle einen prägnanten Markt-Regime-Brief (max. 200 Wörter): Was ist das aktuelle Tape, welche Säulen bestätigen sich, was sind die größten Risiken und Frühwarnungen?"
      : null;

  const fullMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    ...(initialPrompt ? [{ role: "user", content: initialPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

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
    try {
      const modelsRes = await fetch(`${apiBase}/v1/models`, { cache: "no-store" });
      if (modelsRes.ok) {
        const modelsJson = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
        const first = modelsJson.data?.[0]?.id;
        if (first) model = first;
      }
    } catch { /* ignore */ }
    if (!model) model = "local-model";
  }

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
        messages: fullMessages,
        stream: true,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "llm_unreachable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json({ error: "llm_error", detail: text }, { status: 502 });
  }

  // Stream response + accumulate summary for cache update
  const encoder = new TextEncoder();
  let accumulated = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(chunk));

          // Accumulate text for summary extraction
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content ?? "";
              if (content) accumulated += content;
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      controller.close();

      // Update cache summary (first 200 chars of response)
      if (accumulated && health.summary === null) {
        const summary = accumulated.slice(0, 200).replace(/\n/g, " ").trim();
        const updated = { ...health, summary };
        setMarketHealthCache(updated);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
