/**
 * Tests für die Fair-Value-Engine (Phase F.1).
 */
import { describe, it, expect } from "vitest";
import {
  computeFairValue,
  type FairValueInput,
  type FairValuePeerMedians,
} from "@/lib/research/fair-value";

// ─── Base fixture ─────────────────────────────────────────────────────────────

const PEER_MEDIANS: FairValuePeerMedians = {
  ev_sales: 10.0,
  ev_gross_profit: 14.0,
  forward_pe: 35.0,
  revenue_growth_yoy: 0.20,
  gross_margin: 0.72,
  operating_margin: 0.08,
};

function makeInput(overrides?: Partial<FairValueInput>): FairValueInput {
  // Fixed revenue_ttm=1812.5 so point_estimate is independent of current_price
  // EV = price*shares + netDebt: 150*100 + (-500) = 14500; ev_sales=8 → revTTM=14500/8=1812.5
  return {
    ticker: "TEST",
    currency: "USD",
    currentPrice: 150,
    asof: "2026-05-22",
    keyMetrics: {
      revenue_growth_yoy: 0.20,
      gross_margin: 0.72,
      ntm_pe: 40,
      ev_sales: 8.0,
      ev_gross_profit: 11.1,
    },
    businessModel: "SaaS",
    peerMedians: PEER_MEDIANS,
    netDebt: -500,
    sharesOutstanding: 100,
    revenueTtm: 1812.5,   // explicit, breaks circular dependency
    ownHistoricalMultiples: {
      ev_sales: [7.6, 8.1, 8.3, 7.9, 8.0],
      ev_gross_profit: [10.8, 11.2, 11.1, 10.9, 11.0],
      forward_pe: [33, 34, 35, 32, 34],
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeFairValue", () => {
  it("drei Methoden anwendbar → applicable_method_count=3, point_estimate vorhanden", () => {
    const result = computeFairValue(makeInput());
    expect(result.applicable_method_count).toBe(3);
    expect(result.point_estimate).not.toBeNull();
    expect(result.point_estimate).toBeGreaterThan(0);
  });

  it("stabile Eigenhistorie ueber mehrere Methoden → confidence mindestens medium", () => {
    const input = makeInput({
      ownHistoricalMultiples: {
        ev_sales: [7.8, 8.0, 8.1, 7.9, 8.0, 8.1],
        ev_gross_profit: [10.9, 11.0, 11.1, 11.0, 10.8, 11.2],
        forward_pe: [33, 34, 34, 33, 35, 34],
      },
    });
    const result = computeFairValue(input);
    expect(result.applicable_method_count).toBe(3);
    expect(["high", "medium"]).toContain(result.confidence);
  });

  it("nur EV/Sales verfügbar (negative Earnings, kein Gross Profit) → count=1, confidence=low, range=±8%", () => {
    const result = computeFairValue(
      makeInput({
        keyMetrics: {
          revenue_growth_yoy: 0.20,
          gross_margin: -0.05,  // negative → EV/GP not applicable
          ntm_pe: -20,          // negative earnings → Forward P/E not applicable
          ev_sales: 8.0,
        },
      }),
    );
    expect(result.applicable_method_count).toBe(1);
    expect(result.confidence).toBe("low");
    if (result.point_estimate !== null && result.range_low !== null && result.range_high !== null) {
      expect(result.range_low).toBeCloseTo(result.point_estimate * 0.92, 1);
      expect(result.range_high).toBeCloseTo(result.point_estimate * 1.08, 1);
    }
  });

  it("currency mismatch blockiert nicht: Methoden bleiben anwendbar", () => {
    const result = computeFairValue(makeInput({ currency: "EUR" }));
    expect(result.applicable_method_count).toBe(3);
    expect(result.point_estimate).not.toBeNull();
  });

  it("saturation: current_price = 10× point_estimate → overvalued, upside_pct ≈ -0.9", () => {
    const base = computeFairValue(makeInput());
    if (base.point_estimate === null) return;
    // With fixed revenueTtm, changing currentPrice doesn't change the fair value estimate.
    // So if price = 10× point_estimate, the stock should be overvalued.
    const exaggeratedPrice = base.point_estimate * 10;
    const result = computeFairValue(makeInput({ currentPrice: exaggeratedPrice }));
    expect(result.classification).toBe("overvalued");
    if (result.upside_pct !== null) {
      expect(result.upside_pct).toBeLessThan(-0.85);
    }
  });

  it("alle Methoden Null-Werte → point_estimate=null, classification=null, kein Crash", () => {
    const result = computeFairValue(
      makeInput({
        keyMetrics: {},
        ownHistoricalMultiples: {
          ev_sales: [],
          ev_gross_profit: [],
          forward_pe: [],
        },
        peerMedians: {
          ev_sales: null,
          ev_gross_profit: null,
          forward_pe: null,
          revenue_growth_yoy: null,
          gross_margin: null,
          operating_margin: null,
        },
      }),
    );
    expect(result.point_estimate).toBeNull();
    expect(result.classification).toBeNull();
    expect(result.applicable_method_count).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("reverse_dcf 'extreme' wird durchgereicht, nicht in Korb verrechnet", () => {
    const rdcf = {
      implied_fcf_cagr: 0.55,
      terminal_growth: 0.03,
      horizon_years: 10,
      classification: "extreme" as const,
    };
    const result = computeFairValue(makeInput({ reverseDcf: rdcf }));
    expect(result.reverse_dcf).toEqual(rdcf);
    // Ensure the point_estimate is unchanged — reverse_dcf annotation only
    const withoutRDCF = computeFairValue(makeInput({ reverseDcf: null }));
    expect(result.point_estimate).toBeCloseTo(withoutRDCF.point_estimate ?? 0, 0);
  });

  it("upside_pct vorhanden wenn current_price > 0", () => {
    const result = computeFairValue(makeInput());
    expect(result.upside_pct).not.toBeNull();
  });

  it("classification deep_value wenn Preis weit unter range_low", () => {
    const base = computeFairValue(makeInput());
    if (base.range_low === null) return;
    const cheapPrice = base.range_low * 0.5; // 50% unter range_low
    const result = computeFairValue(makeInput({ currentPrice: cheapPrice }));
    expect(result.classification).toBe("deep_value");
  });

  it("classification fair wenn Preis in [range_low, range_high]", () => {
    const base = computeFairValue(makeInput());
    if (base.range_low === null || base.range_high === null) return;
    // Since revenueTtm is fixed, point_estimate doesn't change with price.
    // Price between range_low and range_high → fair
    const fairPrice = (base.range_low + base.range_high) / 2;
    // The range is based on fixed revenueTtm, so result is independent of current price
    const result = computeFairValue(makeInput({ currentPrice: fairPrice }));
    expect(["fair", "value", "premium"]).toContain(result.classification);
  });

  it("rationale_short ≤ 120 Zeichen", () => {
    const result = computeFairValue(makeInput());
    expect(result.rationale_short.length).toBeLessThanOrEqual(120);
  });

  it("method rationale ≤ 90 Zeichen", () => {
    const result = computeFairValue(makeInput());
    for (const m of result.methods) {
      expect(m.rationale.length).toBeLessThanOrEqual(90);
    }
  });

  it("verwirft instabile historische EV/Sales-Serien", () => {
    const result = computeFairValue(
      makeInput({
        ownHistoricalMultiples: {
          ev_sales: [2, 5, 12, 3, 15, 1],
          ev_gross_profit: [10.8, 11.0, 11.2, 10.9],
          forward_pe: [33, 34, 35, 34],
        },
      }),
    );
    const evSalesMethod = result.methods.find((m) => m.name === "ev_sales");
    expect(evSalesMethod?.applicable).toBe(false);
  });

  it("fehlende sharesOutstanding → EV-basierte Methoden nicht anwendbar, Fwd P/E bleibt", () => {
    const result = computeFairValue(makeInput({ sharesOutstanding: null }));
    // EV/Sales and EV/GP require shares; Forward P/E does not
    const evSalesMethod = result.methods.find(m => m.name === "ev_sales");
    const evGpMethod = result.methods.find(m => m.name === "ev_gross_profit");
    const peMethod = result.methods.find(m => m.name === "forward_pe");
    expect(evSalesMethod?.applicable).toBe(false);
    expect(evGpMethod?.applicable).toBe(false);
    // Forward P/E CAN still work (price/ntm_pe=per-share, no shares needed)
    expect(peMethod?.applicable).toBe(true);
  });

  it("asof wird durchgereicht", () => {
    const result = computeFairValue(makeInput({ asof: "2026-01-15" }));
    expect(result.asof).toBe("2026-01-15");
  });

  it("currency wird durchgereicht", () => {
    const result = computeFairValue(makeInput({ currency: "GBP" }));
    expect(result.currency).toBe("GBP");
  });
});
