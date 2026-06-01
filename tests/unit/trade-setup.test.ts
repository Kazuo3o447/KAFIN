import { describe, expect, it } from "vitest";
import { computeTradeSetup } from "@/lib/research/trade-setup";

describe("trade setup", () => {
  it("computes entry, stop and risk/reward deterministically", () => {
    const out = computeTradeSetup({
      gate: "Green",
      lens: "quality_compounder",
      regime: "neutral",
      fairValue: {
        current_price: 95,
        range_low: 90,
        point_estimate: 110,
      },
      technicals: {
        sma200: 84,
        atr: 3,
      },
    });

    expect(out.computable).toBe(true);
    expect(out.entry_zone_max).not.toBeNull();
    expect(out.action).toBe("warten");
    expect(out.stop_ref).not.toBeNull();
    expect(out.risk_reward).not.toBeNull();
    expect(out.margin_of_safety).toBeGreaterThan(0);
  });

  it("returns not computable when fair value inputs are missing", () => {
    const out = computeTradeSetup({
      gate: "Yellow",
      lens: "emerging_winner",
      regime: "risk_on",
      fairValue: {
        current_price: null,
        range_low: null,
        point_estimate: null,
      },
      technicals: null,
    });

    expect(out.computable).toBe(false);
    expect(out.action).toBe("nicht_beurteilbar");
    expect(out.entry_zone_max).toBeNull();
    expect(out.risk_reward).toBeNull();
  });
});
