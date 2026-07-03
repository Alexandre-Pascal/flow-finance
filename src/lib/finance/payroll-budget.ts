/**
 * @file payroll-budget.ts
 * @description Attribution budgétaire du salaire au mois suivant (salaire de juillet → budget août).
 */

import { isPayrollTransfer } from "@/lib/finance/tracked-transfers";
import type { TransactionWithAccount } from "@/types/database";

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
 * Mois budgétaire d'une transaction revenu (salaire CyFyn → mois suivant).
 */
export function getIncomeMonthKey(tx: TransactionWithAccount): string {
  const bookingMonth = tx.booking_date.slice(0, 7);
  if (tx.amount > 0 && isPayrollTransfer(tx)) {
    return shiftMonthKey(bookingMonth, 1);
  }
  return bookingMonth;
}

/**
 * Mois de réception bancaire correspondant à un mois budgétaire salaire.
 */
export function getPayrollBookingMonthKey(budgetMonthKey: string): string {
  return shiftMonthKey(budgetMonthKey, -1);
}

/**
 * Somme des revenus du mois budgétaire courant.
 */
export function sumBudgetMonthIncome(
  transactions: TransactionWithAccount[],
  now: Date = new Date(),
): number {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const currentBudgetMonth = `${year}-${month}`;

  return transactions
    .filter(
      (tx) =>
        !tx.savings_transfer &&
        tx.amount > 0 &&
        getIncomeMonthKey(tx) === currentBudgetMonth,
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}
