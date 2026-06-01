import { describe, expect, it } from "vitest";
import { classifyQuadrant, deriveActionRecommendation } from "@/lib/scoring/timing";

describe("quadrant action", () => {
  it("maps quadrant labels deterministically", () => {
    expect(classifyQuadrant(80, 75)).toBe("kaufen");
    expect(classifyQuadrant(80, 40)).toBe("warten");
    expect(classifyQuadrant(50, 75)).toBe("spekulativ");
    expect(classifyQuadrant(50, 40)).toBe("meiden");
  });

  it("maps each quadrant x regime to expected action", () => {
    expect(deriveActionRecommendation("warten", "risk_off")).toBe("watchlist_wait_or_smaller_size");
    expect(deriveActionRecommendation("kaufen", "risk_on")).toBe("active_accumulate");
    expect(deriveActionRecommendation("spekulativ", "neutral")).toBe("speculative_only_small");
    expect(deriveActionRecommendation("meiden", "risk_off")).toBe("strict_avoid");
  });
});
