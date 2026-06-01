import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DCF_ASSUMPTIONS, MODEL_ASSUMPTIONS, WACC_DEFAULTS } from "@/lib/research/assumptions";
import { THRESHOLDS } from "@/lib/research/thresholds";

describe("assumptions centralized", () => {
  it("keeps WACC/DCF defaults aligned with central assumptions", () => {
    expect(THRESHOLDS.wacc_risk_free_rate).toBe(WACC_DEFAULTS.riskFreeRate);
    expect(THRESHOLDS.wacc_equity_risk_premium).toBe(WACC_DEFAULTS.equityRiskPremium);
    expect(THRESHOLDS.wacc_cost_of_debt).toBe(WACC_DEFAULTS.costOfDebt);
    expect(THRESHOLDS.wacc_tax_rate).toBe(WACC_DEFAULTS.taxRate);
    expect(THRESHOLDS.reverse_dcf_terminal_growth).toBe(DCF_ASSUMPTIONS.terminalGrowth);
    expect(MODEL_ASSUMPTIONS.length).toBeGreaterThan(0);
  });

  it("prevents hardcoded assumption literals outside assumptions.ts", () => {
    const files = [
      "src/lib/research/reverse-dcf.ts",
      "src/lib/research/fair-value.ts",
      "src/lib/orchestrator/steps.ts",
      "src/lib/research/derived-metrics.ts",
    ].map((p) => path.join(process.cwd(), p));

    const forbidden = [
      "terminal_growth: 0.03",
      "terminalGrowth = 0.03",
      "wacc_tax_rate: 0.21",
      "wacc_risk_free_rate: 0.045",
      "wacc_equity_risk_premium: 0.055",
    ];

    const hits: string[] = [];
    for (const file of files) {
      const txt = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        if (txt.includes(token)) {
          hits.push(`${path.relative(process.cwd(), file)} contains '${token}'`);
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
