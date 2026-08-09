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

const payrollOptions = {
  payrollKeyword: "CYFYN",
  budgetShiftMonths: 1 as const,
};

describe("payroll-budget", () => {
  it("shifts July payroll to August budget month when configured", () => {
    expect(getIncomeMonthKey(payrollTx("2025-07-28", 3000), payrollOptions)).toBe(
      "2025-08",
    );
  });

  it("keeps payroll in booking month when shift is 0", () => {
    expect(
      getIncomeMonthKey(payrollTx("2025-07-28", 3000), {
        payrollKeyword: "CYFYN",
        budgetShiftMonths: 0,
      }),
    ).toBe("2025-07");
  });

  it("keeps non-payroll income in booking month", () => {
    const tx = payrollTx("2025-07-28", 100);
    tx.description = "VIREMENT EN VOTRE FAVEUR VIR INST de PASCAL SOPHIE";
    expect(getIncomeMonthKey(tx, payrollOptions)).toBe("2025-07");
  });

  it("sums August budget income from July payroll", () => {
    const income = sumBudgetMonthIncome(
      [payrollTx("2025-07-28", 3200)],
      new Date("2025-08-15T12:00:00Z"),
      payrollOptions,
    );
    expect(income).toBe(3200);
  });

  it("counts tracked family income in the budget month and skips ALUTEC", () => {
    const mother = payrollTx("2025-08-10", 200);
    mother.description = "VIREMENT EN VOTRE FAVEUR DE MME PASCAL SOPHIE";
    const alutec = payrollTx("2025-08-12", 5000);
    alutec.description =
      "VIREMENT EN VOTRE FAVEUR ALUTEC MME PASCAL SOPHIE ALUTEC";

    const options = {
      ...payrollOptions,
      incomeSources: [
        {
          id: "sophie",
          label: "Sophie",
          keywords: ["PASCAL SOPHIE"],
          excludeKeywords: ["ALUTEC"],
          requireRoundAmount: true,
        },
      ],
    };

    expect(
      sumBudgetMonthIncome(
        [mother, alutec, payrollTx("2025-07-28", 3200)],
        new Date("2025-08-15T12:00:00Z"),
        options,
      ),
    ).toBe(3400);
  });

  it("keeps tracked income in booking month even with payroll shift", () => {
    const mother = payrollTx("2025-07-28", 200);
    mother.description = "VIREMENT EN VOTRE FAVEUR DE MME PASCAL SOPHIE";
    const options = {
      ...payrollOptions,
      incomeSources: [
        {
          id: "sophie",
          label: "Sophie",
          keywords: ["PASCAL SOPHIE"],
          excludeKeywords: [],
          requireRoundAmount: true,
        },
      ],
    };
    expect(getIncomeMonthKey(mother, options)).toBe("2025-07");
  });

  it("shifts across year boundary", () => {
    expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
    expect(getIncomeMonthKey(payrollTx("2025-12-30", 3000), payrollOptions)).toBe(
      "2026-01",
    );
  });
});
