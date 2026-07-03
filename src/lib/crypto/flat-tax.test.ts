import { describe, expect, it } from "vitest";
import { computePortfolioFlatTax } from "./flat-tax";

describe("computePortfolioFlatTax", () => {
  it("computes PFU on portfolio gain (total actuel - investi)", () => {
    const result = computePortfolioFlatTax(3500, 2163);
    expect(result.latentGainEur).toBe(1337);
    expect(result.flatTaxEur).toBe(401.1);
    expect(result.netIfSoldTodayEur).toBe(3098.9);
  });

  it("returns zero tax when portfolio is at a loss", () => {
    const result = computePortfolioFlatTax(2000, 2163);
    expect(result.latentGainEur).toBe(0);
    expect(result.flatTaxEur).toBe(0);
    expect(result.netIfSoldTodayEur).toBe(2000);
  });
});
