import { describe, expect, it } from "vitest";
import { KeyMetricsSchema } from "@/lib/schemas/report";
import { sanitizeSummaryClaims } from "@/lib/research/summary-consistency";

describe("summary consistency guard", () => {
  it("rewrites strong growth claim when growth data is weak", () => {
    const km = KeyMetricsSchema.parse({ revenue_growth_yoy: 0.038, revenue_growth_latest_q: null });
    const out = sanitizeSummaryClaims(["Strong growth trajectory supports upside"], { km });
    expect(out.issues.length).toBeGreaterThan(0);
    expect(out.sanitized[0]).toContain("depends on measurable re-acceleration");
  });
});
