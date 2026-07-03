import { describe, expect, it } from "vitest";
import {
  mapSignedTransactionAmount,
  resolveTransactionIndicator,
} from "./transaction-sign";

describe("resolveTransactionIndicator", () => {
  it("forces CRDT for CyFyn payroll even when API sends DBIT", () => {
    const indicator = resolveTransactionIndicator({
      credit_debit_indicator: "DBIT",
      remittance_information: [
        "VIREMENT EN VOTRE FAVEUR VIR INST de CyFyn Paye",
      ],
    });

    expect(indicator).toBe("CRDT");
    expect(mapSignedTransactionAmount("2500.00", indicator)).toBe(2500);
  });

  it("keeps DBIT for outgoing transfers", () => {
    const indicator = resolveTransactionIndicator({
      credit_debit_indicator: "CRDT",
      remittance_information: ["VIREMENT EMIS WEB M. PASCAL"],
    });

    expect(indicator).toBe("DBIT");
    expect(mapSignedTransactionAmount("100.00", indicator)).toBe(-100);
  });
});
