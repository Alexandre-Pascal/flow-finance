/**
 * @file aggregates.ts
 * @description Calculs agrégés sur comptes et transactions.
 */

import type { Account, TransactionWithAccount } from "@/types/database";

export function sumAccountBalances(accounts: Account[]): number {
  return accounts.reduce((sum, account) => sum + Number(account.balance), 0);
}

export function getCurrentMonthTransactions(
  transactions: TransactionWithAccount[],
): TransactionWithAccount[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return transactions.filter((tx) => {
    const date = new Date(tx.booking_date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

/**
 * Agrège les dépenses (montants négatifs) sur les 6 derniers mois calendaires.
 */
export function buildMonthlySpending(
  transactions: TransactionWithAccount[],
  locale: string,
): { month: string; amount: number }[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: "short" });
  const now = new Date();
  const buckets: { month: string; amount: number }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const spending = transactions
      .filter((tx) => {
        const booked = new Date(tx.booking_date);
        return (
          booked.getFullYear() === date.getFullYear() &&
          booked.getMonth() === date.getMonth() &&
          tx.amount < 0
        );
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    buckets.push({
      month: formatter.format(date),
      amount: Math.round(spending),
    });
  }

  return buckets;
}
