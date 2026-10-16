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
import { isNeutralTransfer } from "@/lib/finance/account-transfers";
import { isRefund } from "@/lib/finance/refunds";
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
/**
 * À partir de ce jour du mois, un salaire est considéré comme versé pour le
 * mois suivant. En deçà, c'est un complément du mois en cours (rappel, prime,
 * solde de tout compte) : le décaler l'enverrait financer un mois à venir.
 */
export const PAYROLL_SHIFT_MIN_DAY = 20;

/** Mois budgétaire d'un virement de salaire, décalage compris. */
export function payrollBudgetMonthKey(
  bookingDate: string,
  shiftMonths: number,
): string {
  const bookingMonth = bookingDate.slice(0, 7);
  if (shiftMonths === 0) {
    return bookingMonth;
  }

  const day = Number(bookingDate.slice(8, 10));
  return Number.isFinite(day) && day >= PAYROLL_SHIFT_MIN_DAY
    ? shiftMonthKey(bookingMonth, shiftMonths)
    : bookingMonth;
}

/**
 * Mois budgétaire d'une transaction, décalage manuel compris.
 *
 * Un virement reçu le 28 finance souvent le mois suivant : la règle du salaire
 * ne s'applique qu'au salaire, alors l'utilisateur tranche ligne à ligne. Son
 * choix prime sur toute détection.
 */
export function budgetMonthKey(
  tx: Pick<TransactionWithAccount, "booking_date" | "budget_month_shift">,
  automaticShift: number,
): string {
  const bookingMonth = tx.booking_date.slice(0, 7);
  if (tx.budget_month_shift != null) {
    return shiftMonthKey(bookingMonth, tx.budget_month_shift);
  }
  return payrollBudgetMonthKey(tx.booking_date, automaticShift);
}

export function getIncomeMonthKey(
  tx: TransactionWithAccount,
  options: PayrollBudgetOptions = {},
): string {
  const keyword = options.payrollKeyword;
  const shift = options.budgetShiftMonths ?? 0;
  const sources = options.incomeSources ?? [];

  // Aide familiale / rentrées suivies : jamais décalées comme un salaire —
  // sauf si l'utilisateur l'a demandé, ce dont `budgetMonthKey` se charge.
  const tracked = sources.some((source) => isTrackedIncomeTransfer(tx, source));
  const automatic =
    !tracked && tx.amount > 0 && isPayrollTransfer(tx, keyword) ? shift : 0;

  return budgetMonthKey(tx, automatic);
}

/**
 * Mois de réception bancaire correspondant à un mois budgétaire salaire.
 */
export function getPayrollBookingMonthKey(
  budgetMonth: string,
  budgetShiftMonths = 1,
): string {
  return shiftMonthKey(budgetMonth, -budgetShiftMonths);
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

  // Un remboursement annule une dépense ; le compter en entrée gonflerait le
  // budget de l'argent qu'on n'a jamais gagné.
  if (isRefund(tx)) {
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

  if (isNeutralTransfer(tx)) {
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

  if (isNeutralTransfer(tx)) {
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
 * Ce qu'une ligne pèse dans les dépenses : positif pour un débit, négatif pour
 * un remboursement, zéro pour tout le reste.
 *
 * Un seul endroit décide du signe, sinon chaque agrégat réinvente la règle et
 * l'un d'eux finit par compter un remboursement comme une dépense de plus.
 */
export function budgetExpenseAmount(
  tx: TransactionWithAccount,
  options: PayrollBudgetOptions = {},
): number {
  if (isRefund(tx)) {
    return -tx.amount;
  }
  return shouldCountAsBudgetExpense(tx, options) ? Math.abs(tx.amount) : 0;
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
