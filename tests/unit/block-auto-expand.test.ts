import { describe, it, expect } from "vitest";
import { findAutoExpandBlock } from "@/components/BlockOverviewBars";
import type { BlockKey } from "@/lib/scoring/weights";
import { BLOCK_WEIGHTS } from "@/lib/scoring/weights";

function allGoodBreakdown(): Record<BlockKey, number> {
  const out: Partial<Record<BlockKey, number>> = {};
  for (const k of Object.keys(BLOCK_WEIGHTS) as BlockKey[]) {
    out[k] = BLOCK_WEIGHTS[k]; // 100% filled
  }
  return out as Record<BlockKey, number>;
}

describe("findAutoExpandBlock", () => {
  it("returns null when all blocks are fully filled and no hard blockers", () => {
    const result = findAutoExpandBlock(allGoodBreakdown(), []);
    expect(result).toBeNull();
  });

  it("returns valuation when it is the weakest block", () => {
    const breakdown = allGoodBreakdown();
    // valuation max = BLOCK_WEIGHTS.valuation; set to ~28% fill
    breakdown.valuation = Math.round(BLOCK_WEIGHTS.valuation * 0.28);
    const result = findAutoExpandBlock(breakdown, []);
    expect(result).toBe("valuation");
  });

  it("returns the hard-blocker block even if other blocks are weaker", () => {
    const breakdown = allGoodBreakdown();
    // Make valuation very bad
    breakdown.valuation = 0;
    // Hard blocker is a capital dilution blocker
    const result = findAutoExpandBlock(breakdown, ["Extreme Share Dilution"]);
    // "Extreme Share Dilution" maps to capital_discipline_dilution
    expect(result).toBe("capital_discipline_dilution");
  });

  it("returns null when worst gap is less than 25%", () => {
    const breakdown = allGoodBreakdown();
    // Set each block to 80% of max
    for (const k of Object.keys(BLOCK_WEIGHTS) as BlockKey[]) {
      breakdown[k] = Math.ceil(BLOCK_WEIGHTS[k] * 0.8);
    }
    const result = findAutoExpandBlock(breakdown, []);
    expect(result).toBeNull();
  });

  it("returns worst block when gap ≥ 25% and no hard blockers", () => {
    const breakdown = allGoodBreakdown();
    // growth_market at 50% → gap = 0.5 (> 0.25)
    breakdown.growth_market = Math.floor(BLOCK_WEIGHTS.growth_market * 0.5);
    const result = findAutoExpandBlock(breakdown, []);
    expect(result).toBe("growth_market");
  });
});
