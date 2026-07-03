import { describe, expect, it } from "vitest";
import { getIncomeMonthKey, shiftMonthKey, sumBudgetMonthIncome } from "./payroll-budget";
import type { TransactionWithAccount } from "@/types/database";

function payrollTx(bookingDate: string, amount: number): TransactionWithAccount {
  return {
    id: `tx-${bookingDate}`,
    account_id: "acc-1",
    entry_reference: "ref",
    booking_date: bookingDate,
    amount,
    currency: "EUR",
    description: "VIREMENT EN VOTRE FAVEUR VIR INST de CyFyn Paye",
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: `${bookingDate}T00:00:00Z`,
    updated_at: `${bookingDate}T00:00:00Z`,
    account_name: "Compte courant",
    account_type: "checking",
  };
}

describe("payroll-budget", () => {
  it("shifts July payroll to August budget month", () => {
    expect(getIncomeMonthKey(payrollTx("2025-07-28", 3000))).toBe("2025-08");
  });

  it("keeps non-payroll income in booking month", () => {
    const tx = payrollTx("2025-07-28", 100);
    tx.description = "VIREMENT EN VOTRE FAVEUR VIR INST de PASCAL SOPHIE";
    expect(getIncomeMonthKey(tx)).toBe("2025-07");
  });

  it("sums August budget income from July payroll", () => {
    const income = sumBudgetMonthIncome(
      [payrollTx("2025-07-28", 3200)],
      new Date("2025-08-15T12:00:00Z"),
    );
    expect(income).toBe(3200);
  });

  it("shifts across year boundary", () => {
    expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
    expect(getIncomeMonthKey(payrollTx("2025-12-30", 3000))).toBe("2026-01");
  });
});
