import { describe, it, expect } from "vitest";
import { computeScore } from "@/lib/scoring/score";
import { computeGate, canHandoffToTradeEngine } from "@/lib/scoring/gate";
import { BLOCK_WEIGHTS } from "@/lib/scoring/weights";

describe("computeScore", () => {
  it("Block-Gewichte summieren auf 100", () => {
    const sum = Object.values(BLOCK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("alle Indikatoren=10 → Total=100", () => {
    const blocks = Object.fromEntries(
      Object.keys(BLOCK_WEIGHTS).map((k) => [
        k,
        [
          { key: "a", value: 10 },
          { key: "b", value: 10 },
        ],
      ]),
    ) as Parameters<typeof computeScore>[0];
    const r = computeScore(blocks);
    expect(r.total).toBe(100);
    expect(r.coverage).toBe(1);
  });

  it("alle Indikatoren=null → Total=0, Coverage=0", () => {
    const blocks = Object.fromEntries(
      Object.keys(BLOCK_WEIGHTS).map((k) => [
        k,
        [{ key: "a", value: null }],
      ]),
    ) as Parameters<typeof computeScore>[0];
    const r = computeScore(blocks);
    expect(r.total).toBe(0);
    expect(r.coverage).toBe(0);
  });

  it("Coverage-Penalty unter 50 %", () => {
    const blocks = Object.fromEntries(
      Object.keys(BLOCK_WEIGHTS).map((k) => [
        k,
        [
          { key: "a", value: 10 },
          { key: "b", value: null },
          { key: "c", value: null },
          { key: "d", value: null },
        ],
      ]),
    ) as Parameters<typeof computeScore>[0];
    const r = computeScore(blocks);
    // 25 % Coverage → effective = raw * 0.25/0.5 = raw * 0.5 = 5 → 50
    expect(r.total).toBe(50);
  });
});

describe("computeGate", () => {
  it("Hard-Blocker → Red", () => {
    expect(
      computeGate({
        scoreTotal: 95,
        coverage: 0.9,
        confidence: "high",
        category: "Quality Growth",
        hardBlockers: ["Cash Runway < 12 Monate"],
      }),
    ).toBe("Red");
  });

  it("Score 75 + Quality Growth + high → Green", () => {
    expect(
      computeGate({
        scoreTotal: 75,
        coverage: 0.8,
        confidence: "high",
        category: "Quality Growth",
        hardBlockers: [],
      }),
    ).toBe("Green");
  });

  it("Hype/Risk Kategorie → Red trotz hohem Score", () => {
    expect(
      computeGate({
        scoreTotal: 85,
        coverage: 0.8,
        confidence: "high",
        category: "Hype/Risk",
        hardBlockers: [],
      }),
    ).toBe("Red");
  });

  it("Score 60 → Yellow", () => {
    expect(
      computeGate({
        scoreTotal: 60,
        coverage: 0.7,
        confidence: "medium",
        category: "Quality Growth",
        hardBlockers: [],
      }),
    ).toBe("Yellow");
  });

  it("Niedrige Coverage/Confidence allein erzwingen nicht Red", () => {
    expect(
      computeGate({
        scoreTotal: 60,
        coverage: 0.25,
        confidence: "low",
        category: "Transitional",
        hardBlockers: [],
      }),
    ).toBe("Yellow");
  });

  it("Handoff nur bei Green", () => {
    const ok = canHandoffToTradeEngine({
      scoreTotal: 80,
      coverage: 0.8,
      confidence: "high",
      category: "Quality Growth",
      hardBlockers: [],
    });
    expect(ok).toBe(true);
  });
});
