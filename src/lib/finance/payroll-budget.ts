/**
 * @file payroll-budget.ts
 * @description Attribution budgétaire des revenus (salaire décalé + rentrées suivies).
 */

import {
  hitsTrackedIncomeExclude,
  isNonIncomeTransferDescription,
  isPayrollTransfer,
  isTrackedIncomeTransfer,
} from "@/lib/finance/tracked-transfers";
import type { ProfileTrackedIncomeSource } from "@/lib/profile-settings";
import { isInternalTransfer } from "@/lib/pea/transfers";
import type { TransactionWithAccount } from "@/types/database";

export interface PayrollBudgetOptions {
  payrollKeyword?: string | null;
  budgetShiftMonths?: number;
  /** Sources d'aide familiale : comptent comme revenu, hors exclusions. */
  incomeSources?: ProfileTrackedIncomeSource[];
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
 * Les rentrées suivies (mère, etc.) restent sur le mois de réception.
 */
export function getIncomeMonthKey(
  tx: TransactionWithAccount,
  options: PayrollBudgetOptions = {},
): string {
  const bookingMonth = tx.booking_date.slice(0, 7);
  const keyword = options.payrollKeyword;
  const shift = options.budgetShiftMonths ?? 0;
  const sources = options.incomeSources ?? [];

  // Aide familiale / rentrées suivies : jamais décalées comme un salaire.
  if (sources.some((source) => isTrackedIncomeTransfer(tx, source))) {
    return bookingMonth;
  }

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
 * Crédit qui entre dans les « revenus » budgétaires (dashboard, analytics…).
 * Inclut explicitement les rentrées suivies ; exclut ANNUL / ALUTEC / virements internes.
 */
export function shouldCountAsBudgetIncome(
  tx: TransactionWithAccount,
  options: PayrollBudgetOptions = {},
): boolean {
  if (tx.amount <= 0) {
    return false;
  }

  // Rattachement manuel : l'utilisateur a tranché, le libellé ne compte plus.
  if (tx.income_source) {
    return true;
  }

  if (isNonIncomeTransferDescription(tx.description)) {
    return false;
  }

  const sources = options.incomeSources ?? [];
  if (hitsTrackedIncomeExclude(tx.description, sources)) {
    return false;
  }

  // Rentrées suivies : toujours un revenu (même si un mot-clé épargne matchait).
  if (sources.some((source) => isTrackedIncomeTransfer(tx, source))) {
    return true;
  }

  if (isInternalTransfer(tx)) {
    return false;
  }

  return true;
}

/**
 * Débit pris en compte dans les dépenses budgétaires.
 */
export function shouldCountAsBudgetExpense(
  tx: TransactionWithAccount,
  options: PayrollBudgetOptions = {},
): boolean {
  if (tx.amount >= 0) {
    return false;
  }

  if (isInternalTransfer(tx)) {
    return false;
  }

  if (isNonIncomeTransferDescription(tx.description)) {
    return false;
  }

  const sources = options.incomeSources ?? [];
  if (hitsTrackedIncomeExclude(tx.description, sources)) {
    return false;
  }

  return true;
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

  return (
    Math.round(
      transactions
        .filter(
          (tx) =>
            shouldCountAsBudgetIncome(tx, options) &&
            getIncomeMonthKey(tx, options) === currentBudgetMonth,
        )
        .reduce((sum, tx) => sum + tx.amount, 0) * 100,
    ) / 100
  );
}
