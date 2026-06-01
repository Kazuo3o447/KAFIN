import { describe, expect, it } from "vitest";
import { sanitizeInvestmentStrings } from "@/lib/research/output-sanitizer";

describe("output sanitizer hard blockers", () => {
  it("removes sentinel and QA telemetry entries", () => {
    const out = sanitizeInvestmentStrings(
      [
        "No hard blockers triggered",
        "none",
        "Unsichere Quellenreferenz entfernt (x)",
        "Negative operating margin plus negative FCF and short runway",
      ],
      "hard_blocker",
    );

    expect(out).toEqual(["Negative operating margin plus negative FCF and short runway"]);
  });
});
