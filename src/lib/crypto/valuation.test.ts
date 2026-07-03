import { describe, expect, it } from "vitest";
import { applyCryptoTransaction } from "./valuation";

describe("applyCryptoTransaction", () => {
  it("increases quantity and cost on buy", () => {
    const result = applyCryptoTransaction(
      { quantity: 1, cost_basis_eur: 20000 },
      "buy",
      0.5,
      10000,
    );
    expect(result.quantity).toBe(1.5);
    expect(result.cost_basis_eur).toBe(30000);
  });

  it("reduces cost basis proportionally on sell", () => {
    const result = applyCryptoTransaction(
      { quantity: 2, cost_basis_eur: 20000 },
      "sell",
      1,
      12000,
    );
    expect(result.quantity).toBe(1);
    expect(result.cost_basis_eur).toBe(10000);
  });
});
