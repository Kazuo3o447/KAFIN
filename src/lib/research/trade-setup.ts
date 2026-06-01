import { THRESHOLDS } from "@/lib/research/thresholds";
import type { Lens } from "@/lib/scoring/lenses";

export interface TradeSetupInput {
  gate: "Green" | "Yellow" | "Red";
  lens: Lens;
  regime: "risk_on" | "neutral" | "risk_off" | null;
  fairValue: {
    current_price: number | null;
    range_low: number | null;
    point_estimate: number | null;
  } | null;
  technicals: {
    sma200: number | null;
    atr: number | null;
  } | null;
}

export interface TradeSetup {
  entry_zone_max: number | null;
  margin_of_safety: number | null;
  stop_ref: number | null;
  risk_reward: number | null;
  action: "kaufen" | "warten" | "nicht_beurteilbar";
  sizing_hint: "kleiner" | "normal" | "nicht_beurteilbar";
  distance_to_entry_zone_pct: number | null;
  computable: boolean;
}

function marginOfSafety(lens: Lens, regime: "risk_on" | "neutral" | "risk_off" | null): number {
  if (lens === "emerging_winner") {
    if (regime === "risk_on") return THRESHOLDS.margin_of_safety_emerging_risk_on;
    if (regime === "risk_off") return THRESHOLDS.margin_of_safety_emerging_risk_off;
    return THRESHOLDS.margin_of_safety_emerging_neutral;
  }
  if (regime === "risk_on") return THRESHOLDS.margin_of_safety_quality_risk_on;
  if (regime === "risk_off") return THRESHOLDS.margin_of_safety_quality_risk_off;
  return THRESHOLDS.margin_of_safety_quality_neutral;
}

function round(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(4));
}

export function computeTradeSetup(input: TradeSetupInput): TradeSetup {
  const current = input.fairValue?.current_price ?? null;
  const fairLow = input.fairValue?.range_low ?? null;
  const fairMid = input.fairValue?.point_estimate ?? null;

  if (fairLow === null || fairMid === null || current === null) {
    return {
      entry_zone_max: null,
      margin_of_safety: null,
      stop_ref: null,
      risk_reward: null,
      action: "nicht_beurteilbar",
      sizing_hint: "nicht_beurteilbar",
      distance_to_entry_zone_pct: null,
      computable: false,
    };
  }

  const mos = marginOfSafety(input.lens, input.regime);
  const entry = Math.min(fairLow, fairMid * (1 - mos));

  const sma200 = input.technicals?.sma200 ?? null;
  const atr = input.technicals?.atr ?? null;
  const atrStop = atr !== null ? current - atr * THRESHOLDS.trade_stop_atr_multiple : null;

  let stopRef = sma200;
  if (stopRef === null && atrStop !== null) stopRef = atrStop;
  if (stopRef !== null && atrStop !== null) {
    stopRef = Math.min(stopRef, atrStop);
  }

  const rr =
    stopRef !== null && entry > stopRef && fairMid > entry
      ? (fairMid - entry) / (entry - stopRef)
      : null;

  const zoneWithBuffer = entry * (1 + THRESHOLDS.trade_zone_buffer_pct);
  const action = input.gate === "Red" ? "warten" : current <= zoneWithBuffer ? "kaufen" : "warten";

  const distance = current > 0 ? (current - zoneWithBuffer) / zoneWithBuffer : null;

  const sizingHint =
    input.regime === "risk_off" ? "kleiner" : input.regime === "risk_on" || input.regime === "neutral" ? "normal" : "nicht_beurteilbar";

  return {
    entry_zone_max: round(entry),
    margin_of_safety: round(mos),
    stop_ref: round(stopRef),
    risk_reward: round(rr),
    action,
    sizing_hint: sizingHint,
    distance_to_entry_zone_pct: round(distance),
    computable: true,
  };
}
