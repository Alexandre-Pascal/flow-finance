import { describe, expect, it } from "vitest";
import { computePeaTax } from "@/lib/pea/tax";

describe("computePeaTax", () => {
  it("applique le PFU 30 % avant 5 ans", () => {
    const tax = computePeaTax(1300, 1000, "2025-01-01", new Date("2026-08-01"));
    expect(tax.isMatured).toBe(false);
    expect(tax.latentGainEur).toBe(300);
    expect(tax.taxRate).toBe(0.3);
    expect(tax.taxEur).toBe(90);
    expect(tax.netIfSoldTodayEur).toBe(1210);
  });

  it("n'applique que les prélèvements sociaux après 5 ans", () => {
    const tax = computePeaTax(1300, 1000, "2020-01-01", new Date("2026-08-01"));
    expect(tax.isMatured).toBe(true);
    expect(tax.taxRate).toBe(0.172);
    expect(tax.taxEur).toBe(51.6);
    expect(tax.maturityDate).toBe("2025-01-01");
  });
});
