/**
 * Gate-Logik (research.md §19 + §20).
 * Hard-Blocker setzen Gate = Red unabhängig vom Score.
 */
export type Gate = "Green" | "Yellow" | "Red";
export type Confidence = "low" | "medium" | "high";
export type Category =
  | "Rocket"
  | "Quality Growth"
  | "Transitional"
  | "Hype/Risk"
  | "Dilution Trap"
  | "Broken Growth"
  | "Too Hard"
  | "Ignore";

export interface GateInput {
  scoreTotal: number; // 0..100
  coverage: number; // 0..1
  confidence: Confidence;
  category: Category;
  hardBlockers: string[]; // research.md §19
}

const RED_CATEGORIES: Category[] = [
  "Hype/Risk",
  "Dilution Trap",
  "Broken Growth",
  "Too Hard",
  "Ignore",
];

export function computeGate(input: GateInput): Gate {
  if (input.hardBlockers.length > 0) return "Red";
  if (RED_CATEGORIES.includes(input.category)) return "Red";
  if (input.confidence === "low") return "Red";
  if (input.coverage < 0.4) return "Red";

  if (input.scoreTotal >= 70) return "Green";
  if (input.scoreTotal >= 55) return "Yellow";
  return "Red";
}

export function canHandoffToTradeEngine(input: GateInput): boolean {
  return (
    computeGate(input) === "Green" &&
    input.scoreTotal >= 70 &&
    input.hardBlockers.length === 0 &&
    !RED_CATEGORIES.includes(input.category)
  );
}
