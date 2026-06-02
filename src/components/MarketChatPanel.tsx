"use client";
/**
 * MarketChatPanel – KI-Marktanalyse Chat.
 * Markt-Pendant zum Report-ChatPanel.
 * Initialer Aufruf (messages=[]) generiert einen Regime-Brief.
 * Folgeaufrufe sind interaktiver Chat über den Marktkontext.
 *
 * Guardrails geerdet in MarketHealth-Kontext — Backend-seitig durchgesetzt.
 */
import React, { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  asOf: string | null;
}

export function MarketChatPanel({ asOf }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(userContent?: string) {
    if (streaming) return;
    setError(null);

    const outgoing: ChatMessage[] = userContent
      ? [...messages, { role: "user", content: userContent }]
      : messages;

    if (userContent) {
      setMessages(outgoing);
      setInput("");
    }
    setStarted(true);

    const abort = new AbortController();
    abortRef.current = abort;
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/market/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asOf,
          messages: outgoing,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `http_${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = parsed.choices?.[0]?.delta?.content ?? "";
            if (content) {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: last.content + content };
                }
                return copy;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) void send(input.trim());
    }
  }

  return (
    <div className="flex flex-col h-full bg-secondary-950 rounded-xl border border-secondary-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-800">
        <span className="text-xs font-mono uppercase tracking-widest text-secondary-500">
          KI-Marktanalyse
        </span>
        {!started && (
          <button
            onClick={() => void send()}
            disabled={streaming}
            className="px-3 py-1.5 text-xs bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan rounded hover:bg-accent-cyan/20 disabled:opacity-50"
          >
            Regime-Brief generieren
          </button>
        )}
        {streaming && (
          <button
            onClick={handleStop}
            className="px-3 py-1.5 text-xs bg-red-900/20 border border-red-700/40 text-red-400 rounded hover:bg-red-900/40"
          >
            Stopp
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {messages.length === 0 && !started && (
          <div className="text-xs text-secondary-600 font-mono">
            Klicke „Regime-Brief generieren" für eine KI-Analyse des aktuellen Marktkontexts.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={[
              "text-sm font-mono leading-relaxed whitespace-pre-wrap",
              msg.role === "user"
                ? "text-accent-cyan border-l-2 border-accent-cyan/40 pl-3"
                : "text-secondary-200",
            ].join(" ")}
          >
            {msg.content}
            {/* Streaming cursor on last assistant message */}
            {streaming &&
              i === messages.length - 1 &&
              msg.role === "assistant" && (
                <span className="animate-pulse text-accent-cyan">▋</span>
              )}
          </div>
        ))}
        {error && (
          <div className="text-xs text-red-400 font-mono">⚠ {error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {started && (
        <div className="border-t border-secondary-800 px-3 py-2 flex gap-2">
          <textarea
            className="flex-1 bg-secondary-900 text-secondary-100 text-xs font-mono rounded px-3 py-2 resize-none outline-none border border-secondary-700 focus:border-accent-cyan/50 placeholder-secondary-600"
            rows={2}
            placeholder="Frage zum Marktkontext… (Enter zum Senden)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
          />
          <button
            onClick={() => { if (input.trim()) void send(input.trim()); }}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 text-xs bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan rounded hover:bg-accent-cyan/20 disabled:opacity-40 self-end"
          >
            Senden
          </button>
        </div>
      )}
    </div>
  );
}
