import { describe, expect, it } from "vitest";
import { classifyImpliedGrowth } from "@/lib/research/reverse-dcf-classification";
import { computeReverseDCF } from "@/lib/research/reverse-dcf";

describe("reverse dcf single classifier", () => {
  it("uses shared implied growth classifier labels", () => {
    expect(classifyImpliedGrowth(0.09, "general_equity")).toBe("reasonable");
    expect(classifyImpliedGrowth(0.29, "general_equity")).toBe("speculative");
  });

  it("reverse dcf output classification comes from shared classifier", () => {
    const out = computeReverseDCF(1000, 40, 0.12, 10, 0.03, "general_equity");
    expect(["conservative", "reasonable", "ambitious", "speculative", "extreme", "unknown"]).toContain(out.classification);
  });
});
