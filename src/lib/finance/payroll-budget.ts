/**
 * @file payroll-budget.ts
 * @description Attribution budgétaire du salaire (optionnellement décalée au mois suivant).
 */

import { isPayrollTransfer } from "@/lib/finance/tracked-transfers";
import { isInternalTransfer } from "@/lib/pea/transfers";
import type { TransactionWithAccount } from "@/types/database";

export interface PayrollBudgetOptions {
  payrollKeyword?: string | null;
  budgetShiftMonths?: number;
}

/**
 * Décale une clé mois YYYY-MM de N mois.
 */
export function shiftMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

/**
 * Mois budgétaire d'une transaction revenu.
 * Si un mot-clé salaire est fourni et matche, applique `budgetShiftMonths`.
 */
export function getIncomeMonthKey(
  tx: TransactionWithAccount,
  options: PayrollBudgetOptions = {},
): string {
  const bookingMonth = tx.booking_date.slice(0, 7);
  const keyword = options.payrollKeyword;
  const shift = options.budgetShiftMonths ?? 0;

  if (
    keyword &&
    shift !== 0 &&
    tx.amount > 0 &&
    isPayrollTransfer(tx, keyword)
  ) {
    return shiftMonthKey(bookingMonth, shift);
  }

  return bookingMonth;
}

/**
 * Mois de réception bancaire correspondant à un mois budgétaire salaire.
 */
export function getPayrollBookingMonthKey(
  budgetMonthKey: string,
  budgetShiftMonths = 1,
): string {
  return shiftMonthKey(budgetMonthKey, -budgetShiftMonths);
}

/**
 * Somme des revenus du mois budgétaire courant.
 */
export function sumBudgetMonthIncome(
  transactions: TransactionWithAccount[],
  now: Date = new Date(),
  options: PayrollBudgetOptions = {},
): number {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const currentBudgetMonth = `${year}-${month}`;

  return transactions
    .filter(
      (tx) =>
        !isInternalTransfer(tx) &&
        tx.amount > 0 &&
        getIncomeMonthKey(tx, options) === currentBudgetMonth,
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}
