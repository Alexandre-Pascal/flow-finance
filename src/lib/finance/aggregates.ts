/**
 * @file aggregates.ts
 * @description Calculs agrégés sur comptes et transactions.
 */

import type { Account, TransactionWithAccount } from "@/types/database";

export type MonthlyPeriod = 6 | 12 | "all";

export interface MonthlyOverview {
  monthKey: string;
  month: string;
  monthFull: string;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number | null;
}

export interface MonthDelta {
  value: number;
  percent: number | null;
}

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

function monthKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function enumerateCalendarMonths(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor <= end) {
    keys.push(monthKeyFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
}

/**
 * Agrège revenus, dépenses et solde net par mois calendaire.
 */
export function buildMonthlyOverview(
  transactions: TransactionWithAccount[],
  locale: string,
): MonthlyOverview[] {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });

  const now = new Date();
  const buckets = new Map<string, { income: number; expenses: number }>();

  for (const tx of transactions) {
    const key = tx.booking_date.slice(0, 7);
    const bucket = buckets.get(key) ?? { income: 0, expenses: 0 };

    if (tx.amount > 0) {
      bucket.income += tx.amount;
    } else if (tx.amount < 0) {
      bucket.expenses += Math.abs(tx.amount);
    }

    buckets.set(key, bucket);
  }

  if (buckets.size === 0) {
    return [];
  }

  const sortedKeys = [...buckets.keys()].sort();
  const earliest = new Date(`${sortedKeys[0]}-01`);
  const monthKeys = enumerateCalendarMonths(earliest, now);

  return monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const totals = buckets.get(monthKey) ?? { income: 0, expenses: 0 };
    const income = Math.round(totals.income * 100) / 100;
    const expenses = Math.round(totals.expenses * 100) / 100;
    const net = Math.round((income - expenses) * 100) / 100;

    return {
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      income,
      expenses,
      net,
      savingsRate:
        income > 0 ? Math.round((net / income) * 1000) / 10 : null,
    };
  });
}

export function sliceMonthlyOverview(
  data: MonthlyOverview[],
  period: MonthlyPeriod,
  locale: string,
): MonthlyOverview[] {
  if (period === "all") {
    return data;
  }

  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });
  const byKey = new Map(data.map((row) => [row.monthKey, row]));
  const now = new Date();
  const result: MonthlyOverview[] = [];

  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthKey = monthKeyFromDate(date);
    const existing = byKey.get(monthKey);

    if (existing) {
      result.push(existing);
      continue;
    }

    result.push({
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      income: 0,
      expenses: 0,
      net: 0,
      savingsRate: null,
    });
  }

  return result;
}

export function sumMonthlyOverview(data: MonthlyOverview[]) {
  return data.reduce(
    (acc, row) => ({
      income: acc.income + row.income,
      expenses: acc.expenses + row.expenses,
      net: acc.net + row.net,
    }),
    { income: 0, expenses: 0, net: 0 },
  );
}

export function computeMonthDelta(
  current: number,
  previous: number,
): MonthDelta {
  const value = current - previous;

  if (previous === 0) {
    return { value, percent: current === 0 ? 0 : null };
  }

  return {
    value,
    percent: Math.round((value / previous) * 1000) / 10,
  };
}
