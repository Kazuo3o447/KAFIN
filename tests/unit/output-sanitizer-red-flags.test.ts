import { describe, expect, it } from "vitest";
import { sanitizeInvestmentStrings } from "@/lib/research/output-sanitizer";

describe("output sanitizer red flags", () => {
  it("removes non-events and duplicates while keeping display text", () => {
    const out = sanitizeInvestmentStrings(
      [
        "SBC/Revenue > 10% not triggered",
        "High leverage risk",
        "high leverage risk.",
      ],
      "red_flag",
    );

    expect(out).toEqual(["High leverage risk"]);
  });
});
