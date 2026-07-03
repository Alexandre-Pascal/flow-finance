import { describe, expect, it } from "vitest";
import { computeFlatTax } from "./flat-tax";

describe("computeFlatTax", () => {
  it("computes PFU on latent gain", () => {
    const result = computeFlatTax(1, 20000, 25000);
    expect(result.currentValueEur).toBe(25000);
    expect(result.latentGainEur).toBe(5000);
    expect(result.flatTaxEur).toBe(1500);
    expect(result.netIfSoldTodayEur).toBe(23500);
  });

  it("returns zero tax on loss", () => {
    const result = computeFlatTax(1, 25000, 20000);
    expect(result.latentGainEur).toBe(0);
    expect(result.flatTaxEur).toBe(0);
    expect(result.netIfSoldTodayEur).toBe(20000);
  });
});
