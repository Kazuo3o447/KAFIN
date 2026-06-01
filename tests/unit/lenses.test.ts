import { describe, expect, it } from "vitest";
import { LENS_PROFILES } from "@/lib/scoring/lenses";

describe("lens profiles", () => {
  it("uses weights summing to 100 for each lens", () => {
    for (const profile of Object.values(LENS_PROFILES)) {
      const sum = Object.values(profile.blockWeights).reduce((s, v) => s + v, 0);
      expect(sum).toBe(100);
    }
  });

  it("keeps lens indicator sets non-empty", () => {
    expect(LENS_PROFILES.quality_compounder.indicatorSet.length).toBeGreaterThan(0);
    expect(LENS_PROFILES.emerging_winner.indicatorSet.length).toBeGreaterThan(0);
  });
});
