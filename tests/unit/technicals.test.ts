import { describe, expect, it } from "vitest";
import { computeTechnicals } from "@/lib/research/technicals";
import type { PricePoint } from "@/lib/schemas/dataset";

function series(base: number, drift: number, len: number, vol = 0): PricePoint[] {
  const out: PricePoint[] = [];
  let price = base;
  for (let i = 0; i < len; i += 1) {
    price = price * (1 + drift + (i % 5 === 0 ? vol : -vol));
    out.push({ date: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, close: price, volume: 100000 + i * 100 });
  }
  return out;
}

describe("technicals", () => {
  it("computes MA, RSI, MACD, RS and beta for long enough history", () => {
    const price = series(100, 0.002, 320, 0.0008);
    const bench = series(100, 0.0012, 320, 0.0004);
    const sector = series(100, 0.0015, 320, 0.0005);

    const t = computeTechnicals({ price, benchmark: bench, sectorBenchmark: sector });

    expect(t.sma50).not.toBeNull();
    expect(t.sma200).not.toBeNull();
    expect(t.rsi14).not.toBeNull();
    expect((t.rsi14 ?? 0) > 0).toBe(true);
    expect(t.macd.line).not.toBeNull();
    expect(t.relativeStrength.vsIndex12m).not.toBeNull();
    expect(t.relativeStrength.vsSector6m).not.toBeNull();
    expect(t.beta).not.toBeNull();
    expect(t.position52wPct).not.toBeNull();
  });
});
