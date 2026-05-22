/**
 * Unit tests for business model classifier (Phase A).
 */
import { describe, it, expect } from "vitest";
import { classifyBusinessModel } from "@/lib/research/business-model";
import type { ProviderFact } from "@/lib/providers/types";

function fact(field: string, value: unknown): ProviderFact {
  return { field, value, url: "test://", title: field, asOf: "2023-12-31", klass: "B" };
}

describe("classifyBusinessModel", () => {
  it("classifies SIC 7372 as SaaS with high confidence", () => {
    const r = classifyBusinessModel([fact("sic", 7372)]);
    expect(r.type).toBe("SaaS");
    expect(r.confidence).toBe("high");
    expect(r.source).toBe("sic_exact");
  });

  it("classifies SIC 3674 as Semiconductor", () => {
    const r = classifyBusinessModel([fact("sic", 3674)]);
    expect(r.type).toBe("Semiconductor");
  });

  it("classifies SIC 7374 as Infrastructure", () => {
    const r = classifyBusinessModel([fact("sic", 7374)]);
    expect(r.type).toBe("Infrastructure");
  });

  it("uses keyword fallback for company description", () => {
    const r = classifyBusinessModel([
      fact("company_description", "Leading cloud SaaS platform for enterprise HR management"),
    ]);
    expect(r.type).toBe("SaaS");
    expect(r.source).toBe("keyword");
  });

  it("uses keyword fallback for fintech", () => {
    const r = classifyBusinessModel([
      fact("company_description", "Digital payments and fintech solutions provider"),
    ]);
    expect(r.type).toBe("FinTech");
  });

  it("returns Other with low confidence when no signals", () => {
    const r = classifyBusinessModel([]);
    expect(r.type).toBe("Other");
    expect(r.confidence).toBe("low");
    expect(r.source).toBe("fallback");
  });

  it("extracts SIC from embedded profile object", () => {
    const r = classifyBusinessModel([
      fact("company_profile", { sic: 3841, name: "Medical Corp" }),
    ]);
    expect(r.type).toBe("MedDevice");
    expect(r.sic).toBe(3841);
  });

  it("uses SIC range for banking SIC 6020", () => {
    const r = classifyBusinessModel([fact("sic", 6020)]);
    expect(r.type).toBe("Financial");
  });

  it("classifies biotech via SIC 2836", () => {
    const r = classifyBusinessModel([fact("sic", 2836)]);
    expect(r.type).toBe("BioTech");
  });
});
