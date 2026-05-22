/**
 * Tests für den Verdict-Generator (Phase F.2).
 */
import { describe, it, expect } from "vitest";
import { buildVerdict, sanitizeVerdictDetail, findWeakestBlock } from "@/lib/research/verdict";
import type { VerdictInput } from "@/lib/research/verdict";
import type { BlockKey } from "@/lib/scoring/weights";
import { BLOCK_WEIGHTS } from "@/lib/scoring/weights";

// ─── Helper ───────────────────────────────────────────────────────────────────

function scoreBreakdown(overrides: Partial<Record<BlockKey, number>> = {}): Record<BlockKey, number> {
  const defaults: Record<BlockKey, number> = {
    growth_market: 14,
    unit_economics_margins: 11,
    quality_moat: 14,
    valuation: 11,
    capital_discipline_dilution: 9,
    catalysts_revisions_sentiment: 9,
    risk_fragility: 9,
  };
  return { ...defaults, ...overrides };
}

function makeInput(overrides?: Partial<VerdictInput>): VerdictInput {
  return {
    gate: "Green",
    category: "Quality Growth",
    confidence: "high",
    scoreTotal: 77,
    hardBlockers: [],
    scoreBreakdown: scoreBreakdown(),
    weights: BLOCK_WEIGHTS,
    fairValueClassification: "fair",
    upsidePct: 0.10,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildVerdict – Hard Blockers", () => {
  it('Cash Runway → "Blocked — Cash Runway"', () => {
    const result = buildVerdict(
      makeInput({ hardBlockers: ["Cash Runway < 12 Monate"] }),
    );
    expect(result.label).toBe("Blocked — Cash Runway");
    expect(result.reasonCode).toBe("hard_blocker");
  });

  it('Bilanzstress → "Blocked — Bilanzstress"', () => {
    const result = buildVerdict(
      makeInput({ hardBlockers: ["Bilanzstress + negativer FCF."] }),
    );
    expect(result.label).toBe("Blocked — Bilanzstress");
    expect(result.reasonCode).toBe("hard_blocker");
  });

  it("Hard Blocker overrides Gate=Green", () => {
    const result = buildVerdict(
      makeInput({ gate: "Green", hardBlockers: ["Cash Runway < 12 Monate"] }),
    );
    expect(result.label).toMatch(/^Blocked/);
  });
});

describe("buildVerdict – Gate Red (no hard blockers)", () => {
  it('Hype/Risk → "Pass — Hype-Risiko"', () => {
    const result = buildVerdict(
      makeInput({ gate: "Red", category: "Hype/Risk", hardBlockers: [] }),
    );
    expect(result.label).toBe("Pass — Hype-Risiko");
    expect(result.reasonCode).toBe("cat_hype_risk");
  });

  it('Dilution Trap → "Pass — Verwässerung"', () => {
    const result = buildVerdict(
      makeInput({ gate: "Red", category: "Dilution Trap", hardBlockers: [] }),
    );
    expect(result.label).toBe("Pass — Verwässerung");
  });

  it('Broken Growth → "Pass — brechendes Wachstum"', () => {
    const result = buildVerdict(
      makeInput({ gate: "Red", category: "Broken Growth", hardBlockers: [] }),
    );
    expect(result.label).toContain("brechendes Wachstum");
  });
});

describe("buildVerdict – Gate Yellow", () => {
  it("Quality Growth, schwächster Block Valuation, FV overvalued → Bewertung extrem", () => {
    const result = buildVerdict(
      makeInput({
        gate: "Yellow",
        category: "Quality Growth",
        fairValueClassification: "overvalued",
        scoreBreakdown: scoreBreakdown({ valuation: 4 }), // worst block
        hardBlockers: [],
      }),
    );
    expect(result.label).toBe("Quality Growth-Kandidat — Bewertung extrem");
  });

  it("Rocket, schwächster Block Capital Discipline → Verwässerung beobachten", () => {
    const result = buildVerdict(
      makeInput({
        gate: "Yellow",
        category: "Rocket",
        scoreBreakdown: scoreBreakdown({ capital_discipline_dilution: 2 }),
        hardBlockers: [],
      }),
    );
    expect(result.label).toBe("Rocket-Kandidat — Verwässerung beobachten");
  });
});

describe("buildVerdict – Gate Green", () => {
  it('Quality Growth, fair FV → "Quality Growth — bestätigt"', () => {
    const result = buildVerdict(makeInput({ gate: "Green", fairValueClassification: "fair" }));
    expect(result.label).toBe("Quality Growth — bestätigt");
    expect(result.reasonCode).toBe("green_confirmed");
  });

  it('Gate Green, FV deep_value → label enthält "deutlich unter Fair Value"', () => {
    const result = buildVerdict(
      makeInput({ gate: "Green", fairValueClassification: "deep_value" }),
    );
    expect(result.label).toContain("deutlich unter Fair Value");
  });
});

describe("buildVerdict – Label length", () => {
  it("Label ist max 70 Zeichen", () => {
    const inputs: Array<VerdictInput> = [
      makeInput({ gate: "Red", category: "Hype/Risk" }),
      makeInput({ gate: "Yellow", category: "Quality Growth", scoreBreakdown: scoreBreakdown({ valuation: 4 }) }),
      makeInput({ gate: "Green", fairValueClassification: "deep_value" }),
      makeInput({ hardBlockers: ["Cash Runway < 12 Monate"] }),
    ];
    for (const inp of inputs) {
      expect(buildVerdict(inp).label.length).toBeLessThanOrEqual(70);
    }
  });
});

describe("buildVerdict – reasonCode stability", () => {
  it("gleiche Inputs → gleicher reasonCode", () => {
    const inp = makeInput();
    expect(buildVerdict(inp).reasonCode).toBe(buildVerdict(inp).reasonCode);
  });
});

describe("findWeakestBlock", () => {
  it("Valuation 4/14 ist schwächster Block wenn alle anderen ≥ 75%", () => {
    const breakdown = scoreBreakdown({
      growth_market: 16,   // 16/18 = 89%
      unit_economics_margins: 12, // 12/14 = 86%
      quality_moat: 16,    // 16/18 = 89%
      valuation: 4,        // 4/14 = 29% ← weakest
      capital_discipline_dilution: 10, // 10/12 = 83%
      catalysts_revisions_sentiment: 10, // 10/12 = 83%
      risk_fragility: 10,  // 10/12 = 83%
    });
    const weakest = findWeakestBlock(breakdown, BLOCK_WEIGHTS);
    expect(weakest).toBe("valuation");
  });

  it("alle Blöcke gleich → erster oder letzter Block (deterministisch, nicht null)", () => {
    const breakdown = scoreBreakdown();
    // All gaps are zero — first encountered
    const weakest = findWeakestBlock(breakdown, BLOCK_WEIGHTS);
    expect(weakest).not.toBeNull();
  });
});

describe("sanitizeVerdictDetail", () => {
  it("sauberer Text wird durchgereicht", () => {
    const result = sanitizeVerdictDetail("Margen verbessern sich, FCF positiv seit Q3.", "Test");
    expect(result).toBe("Margen verbessern sich, FCF positiv seit Q3.");
  });

  it('"kaufen" im Detail → Fallback', () => {
    const result = sanitizeVerdictDetail("Aktie ist ein klarer Kauf bei 280.", "My Label");
    expect(result).toBe("My Label. Siehe Block-Detail.");
  });

  it('"Buy" (case-insensitive) → Fallback', () => {
    const result = sanitizeVerdictDetail("Strong Buy signal detected.", "LBL");
    expect(result).toBe("LBL. Siehe Block-Detail.");
  });

  it("null → Fallback", () => {
    const result = sanitizeVerdictDetail(null, "Blocked — Cash Runway");
    expect(result).toBe("Blocked — Cash Runway. Siehe Block-Detail.");
  });

  it("leerer String → Fallback", () => {
    const result = sanitizeVerdictDetail("", "Blocked");
    expect(result).toBe("Blocked. Siehe Block-Detail.");
  });

  it("max 200 Zeichen werden durchgesetzt", () => {
    const long = "x".repeat(300);
    const result = sanitizeVerdictDetail(long, "LBL");
    expect(result.length).toBeLessThanOrEqual(200);
  });
});
