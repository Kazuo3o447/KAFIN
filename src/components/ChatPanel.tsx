"use client";

import React, { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  reportId: string;
  ticker: string;
  initialFocusMetric?: string | null;
}

export function ChatPanel({ reportId, ticker, initialFocusMetric = null }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [focusMetric, setFocusMetric] = useState<string | null>(initialFocusMetric);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatAvailable, setChatAvailable] = useState<boolean>(true);
  const [availabilityChecked, setAvailabilityChecked] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // GET ist absichtlich: 404 => Route fehlt; 405/400 => Route vorhanden.
        const res = await fetch(`/api/reports/${reportId}/chat`, { method: "GET" });
        if (!active) return;
        if (res.status === 404) {
          setChatAvailable(false);
        } else {
          setChatAvailable(true);
        }
      } catch {
        if (!active) return;
        setChatAvailable(false);
      } finally {
        if (active) setAvailabilityChecked(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [reportId]);

  useEffect(() => {
    setFocusMetric(initialFocusMetric ?? null);
  }, [initialFocusMetric]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming || !chatAvailable) return;
    setInput("");
    setError(null);

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...nextMessages, assistantMsg]);
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/reports/${reportId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, focusMetric }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string; detail?: string };
        throw new Error(json.detail ?? json.error ?? `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assembled = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            assembled += delta;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: assembled };
              return copy;
            });
          } catch {
            // skip malformed SSE
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div id="chat-panel" className="flex flex-col border border-secondary-800 bg-secondary-950/40 p-2" style={{ minHeight: 280 }}>
      <div className="mb-1 flex items-center justify-between">
        <div className="uppercase tracking-wide text-secondary-400 text-[11px]">
          KI-Chat · {ticker}
        </div>
        {streaming && (
          <button
            onClick={stop}
            className="text-[10px] text-amber-300 border border-amber-700/60 px-1.5 py-0.5 hover:bg-amber-900/20"
          >
            stop
          </button>
        )}
      </div>

      {focusMetric && (
        <div className="mb-1 flex items-center gap-2 text-[11px]">
          <span className="text-secondary-400">Fokus:</span>
          <span className="border border-accent-700/50 bg-accent-900/20 px-1.5 py-0.5 text-accent-300">{focusMetric}</span>
          <button
            type="button"
            onClick={() => setFocusMetric(null)}
            className="text-secondary-500 hover:text-secondary-300"
            title="Fokus entfernen"
          >
            ×
          </button>
        </div>
      )}

      {!chatAvailable && availabilityChecked && (
        <div className="mb-2 border border-amber-700/50 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-200">
          Chat deaktiviert: Backend aktuell nicht verfügbar. Der Report bleibt vollständig nutzbar.
        </div>
      )}

      {/* Message history */}
      <div className="flex-1 overflow-auto space-y-1 mb-1 max-h-[320px]">
        {messages.length === 0 && (
          <div className="text-secondary-500 text-[11px] italic">
            Stelle eine Frage zur Analyse…
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "text-accent-300 whitespace-pre-wrap text-[12px]"
                : "text-secondary-200 whitespace-pre-wrap text-[12px]"
            }
          >
            <span className="text-secondary-500 mr-1">{msg.role === "user" ? ">" : "#"}</span>
            {msg.content}
            {msg.role === "assistant" && streaming && i === messages.length - 1 && (
              <span className="animate-pulse">▋</span>
            )}
          </div>
        ))}
        {error && (
          <div className="text-rose-300 text-[11px]">Fehler: {error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-1 mt-auto">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={streaming || !chatAvailable}
          placeholder="Frage eingeben… (Enter = senden)"
          rows={2}
          className="flex-1 resize-none bg-secondary-900 border border-secondary-700 text-secondary-100 text-[12px] px-2 py-1 font-mono placeholder-secondary-600 focus:outline-none focus:border-accent-600 disabled:opacity-50"
        />
        <button
          onClick={() => void send()}
          disabled={streaming || !input.trim() || !chatAvailable}
          className="border border-secondary-700 bg-secondary-800 px-2 text-[11px] text-secondary-300 hover:bg-secondary-700 disabled:opacity-40"
        >
          {streaming ? "…" : "▶"}
        </button>
      </div>
    </div>
  );
}
