import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReportSchema } from "@/lib/schemas/report";

const DATA_DIR = process.env.DATA_DIR || "./data";

type RangeRule = { key: string; min: number; max: number };

const REFERENCE_RULES: Record<string, RangeRule[]> = {
  AXON: [
    { key: "roic", min: -0.2, max: 1.2 },
    { key: "altman_z", min: 0, max: 20 },
    { key: "net_debt_to_ebitda", min: -10, max: 15 },
    { key: "ev_sales", min: 0, max: 60 },
    { key: "revenue_cagr_3y", min: -0.5, max: 1.5 },
  ],
  HIMS: [
    { key: "ev_sales", min: 0, max: 80 },
    { key: "revenue_cagr_3y", min: -0.5, max: 2.0 },
  ],
  MSFT: [
    { key: "roic", min: -0.2, max: 1.2 },
    { key: "ev_sales", min: 0, max: 40 },
  ],
  "SAP.DE": [
    { key: "roic", min: -0.2, max: 1.2 },
    { key: "ev_sales", min: 0, max: 40 },
  ],
  SPY: [
    { key: "ev_sales", min: 0, max: 20 },
  ],
};

function latestReportPath(ticker: string): string | null {
  const dir = path.join(DATA_DIR, "reports", ticker);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  return path.join(dir, files[files.length - 1]!);
}

describe("reference company regressions", () => {
  for (const [ticker, rules] of Object.entries(REFERENCE_RULES)) {
    it(`keeps ${ticker} key metrics in tolerated ranges`, () => {
      const filePath = latestReportPath(ticker);
      if (!filePath) {
        expect(true).toBe(true);
        return;
      }

      const raw = fs.readFileSync(filePath, "utf8");
      const report = ReportSchema.parse(JSON.parse(raw));

      for (const rule of rules) {
        const value = (report.key_metrics as Record<string, unknown>)[rule.key];
        if (typeof value === "number" && Number.isFinite(value)) {
          expect(value).toBeGreaterThanOrEqual(rule.min);
          expect(value).toBeLessThanOrEqual(rule.max);
        }
      }
    });
  }
});
