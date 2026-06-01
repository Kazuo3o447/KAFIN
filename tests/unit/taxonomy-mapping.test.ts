import { describe, expect, it } from "vitest";
import { BLOCK_WEIGHTS } from "@/lib/scoring/weights";
import { DIMENSION_TO_BLOCK, SCORING_DIMENSIONS, TIMING_AXIS_POLICY } from "@/lib/scoring/taxonomy";

describe("canonical taxonomy mapping", () => {
  it("maps each dimension to exactly one scored block", () => {
    const mapped = SCORING_DIMENSIONS.map((d) => DIMENSION_TO_BLOCK[d]);
    expect(mapped.length).toBe(SCORING_DIMENSIONS.length);
    expect(new Set(mapped).size).toBe(SCORING_DIMENSIONS.length);
    for (const key of mapped) {
      expect(key in BLOCK_WEIGHTS).toBe(true);
    }
  });

  it("includes ownership as explicit scored block and keeps timing orthogonal", () => {
    expect(DIMENSION_TO_BLOCK.ownership_smart_money).toBe("ownership_smart_money");
    expect(TIMING_AXIS_POLICY.isOrthogonal).toBe(true);
  });
});
