import { describe, it, expect } from "vitest";
import { throttledFetch } from "@/lib/providers/throttle";

describe("throttledFetch", () => {
  it("respektiert Rate-Limit pro Host", async () => {
    // Mock global fetch
    const calls: number[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(Date.now());
      return new Response(JSON.stringify({ ok: true, url: String(url) }), { status: 200 });
    }) as typeof fetch;

    try {
      const start = Date.now();
      // 4 requests at 2 req/s → mind. ~1500ms für 4 Aufrufe
      await Promise.all(
        Array.from({ length: 4 }, () =>
          throttledFetch("https://throttle-test.example.com/x", {}, { ratePerSec: 2 }),
        ),
      );
      const elapsed = Date.now() - start;
      // 4 Tokens / 2 per sec = 2s, mit Initial-Capacity 2 → ~1000ms minimum
      expect(elapsed).toBeGreaterThan(800);
      expect(calls.length).toBe(4);
    } finally {
      globalThis.fetch = origFetch;
    }
  }, 10000);
});
