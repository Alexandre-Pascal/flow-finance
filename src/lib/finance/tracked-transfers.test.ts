import { describe, expect, it } from "vitest";
import {
  isPayrollTransfer,
  isTrackedOutgoingTransfer,
  isTrackedPersonTransfer,
} from "./tracked-transfers";
import type { TransactionWithAccount } from "@/types/database";

function tx(
  partial: Partial<TransactionWithAccount> & Pick<TransactionWithAccount, "description" | "amount">,
): TransactionWithAccount {
  return {
    id: "tx-1",
    account_id: "acc-1",
    entry_reference: "ref-1",
    booking_date: "2026-06-15",
    currency: "EUR",
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
    account_name: "Compte courant",
    account_type: "checking",
    ...partial,
  };
}

describe("isPayrollTransfer", () => {
  it("matches employer keyword on incoming transfer", () => {
    expect(
      isPayrollTransfer(
        tx({
          amount: 3200,
          description: "VIREMENT EN VOTRE FAVEUR VIR INST de CyFyn Paye",
        }),
        "CYFYN",
      ),
    ).toBe(true);
  });

  it("rejects when keyword is missing", () => {
    expect(
      isPayrollTransfer(
        tx({
          amount: 3200,
          description: "VIREMENT EN VOTRE FAVEUR VIR INST de CyFyn Paye",
        }),
        null,
      ),
    ).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(
      isPayrollTransfer(
        tx({
          amount: -3200,
          description: "VIREMENT EN VOTRE FAVEUR VIR INST de CyFyn Paye",
        }),
        "CYFYN",
      ),
    ).toBe(false);
  });

  it("rejects unrelated transfers", () => {
    expect(
      isPayrollTransfer(
        tx({
          amount: 100,
          description: "VIREMENT EN VOTRE FAVEUR VIR INST de PASCAL SOPHIE",
        }),
        "CYFYN",
      ),
    ).toBe(false);
  });
});

describe("isTrackedPersonTransfer", () => {
  it("matches configured person keyword", () => {
    expect(
      isTrackedPersonTransfer(
        tx({
          amount: 200,
          description: "VIREMENT EN VOTRE FAVEUR VIR INST de PASCAL SOPHIE",
        }),
        "PASCAL SOPHIE",
      ),
    ).toBe(true);
  });
});

describe("isTrackedOutgoingTransfer", () => {
  it("matches keyword on outgoing transfer debit", () => {
    expect(
      isTrackedOutgoingTransfer(
        tx({
          amount: -150,
          description: "VIREMENT EMIS VERS PASCAL ALEXANDRE",
        }),
        "PASCAL ALEXANDRE",
      ),
    ).toBe(true);
  });

  it("matches VIR EMIS shorthand", () => {
    expect(
      isTrackedOutgoingTransfer(
        tx({
          amount: -80,
          description: "VIR EMIS de COMPTE VERS PASCAL JULIE",
        }),
        "PASCAL JULIE",
      ),
    ).toBe(true);
  });

  it("rejects credit amounts", () => {
    expect(
      isTrackedOutgoingTransfer(
        tx({
          amount: 150,
          description: "VIREMENT EMIS VERS PASCAL ALEXANDRE",
        }),
        "PASCAL ALEXANDRE",
      ),
    ).toBe(false);
  });

  it("rejects incoming transfer wording", () => {
    expect(
      isTrackedOutgoingTransfer(
        tx({
          amount: -150,
          description: "VIREMENT EN VOTRE FAVEUR de PASCAL ALEXANDRE",
        }),
        "PASCAL ALEXANDRE",
      ),
    ).toBe(false);
  });
});
