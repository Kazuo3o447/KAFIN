import { describe, expect, it } from "vitest";
import { routeSector } from "@/lib/scoring/sector-router";
import { scoreCompany } from "@/lib/scoring/engine";
import { makeDataset } from "./dataset-fixture";

describe("sector router", () => {
  it("keeps industrial software in standard path", () => {
    const dataset = makeDataset("quality");
    dataset.identity.sector = "Technology";
    dataset.identity.industry = "Software";

    const route = routeSector(dataset);
    expect(route.rubricClass).toBe("industrial_software");
    expect(route.notScorableWithStandardRubric).toBe(false);
  });

  it("marks financials as not scorable with standard rubric", () => {
    const dataset = makeDataset("quality");
    dataset.identity.sector = "Financial Services";
    dataset.identity.industry = "Banks - Diversified";

    const route = routeSector(dataset);
    expect(route.rubricClass).toBe("financials");
    expect(route.notScorableWithStandardRubric).toBe(true);

    const scored = scoreCompany(dataset, "quality_compounder");
    expect(scored.notScorableWithStandardRubric).toBe(true);
    expect(scored.score).toBeNull();
  });

  it("marks REIT and pre-revenue biotech appropriately", () => {
    const reit = makeDataset("quality");
    reit.identity.sector = "Real Estate";
    reit.identity.industry = "REIT - Industrial";
    expect(routeSector(reit).rubricClass).toBe("reit");

    const bio = makeDataset("emerging");
    bio.identity.sector = "Healthcare";
    bio.identity.industry = "Biotechnology";
    bio.annual[bio.annual.length - 1]!.revenue.value = 0;
    const routeBio = routeSector(bio);
    expect(routeBio.rubricClass).toBe("biotech_pre_revenue");
    expect(routeBio.notScorableWithStandardRubric).toBe(true);
  });
});
