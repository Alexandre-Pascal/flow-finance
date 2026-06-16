/**
 * @file tracked-transfers.ts
 * @description Suivi de virements récurrents identifiés par libellé bancaire.
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import type { TransactionWithAccount } from "@/types/database";

/** Fragment distinctif du libellé bancaire (Crédit Agricole). */
export const MOTHER_TRANSFER_SENDER = "PASCAL SOPHIE";

export interface MonthlyTransferOverview {
  monthKey: string;
  month: string;
  monthFull: string;
  amount: number;
  transferCount: number;
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
 * Virement entrant de Sophie Pascal (ex. « VIREMENT EN VOTRE FAVEUR VIR INST de PASCAL SOPHIE »).
 */
export function isMotherTransfer(tx: TransactionWithAccount): boolean {
  if (tx.amount <= 0) {
    return false;
  }

  const description = tx.description.toUpperCase();

  return (
    description.includes(MOTHER_TRANSFER_SENDER) &&
    (description.includes("VIREMENT EN VOTRE FAVEUR") ||
      description.includes("VIR INST"))
  );
}

export function buildMonthlyTransferOverview(
  transactions: TransactionWithAccount[],
  locale: string,
  predicate: (tx: TransactionWithAccount) => boolean,
): MonthlyTransferOverview[] {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });

  const matched = transactions.filter(predicate);
  if (matched.length === 0) {
    return [];
  }

  const buckets = new Map<string, { amount: number; transferCount: number }>();

  for (const tx of matched) {
    const key = tx.booking_date.slice(0, 7);
    const bucket = buckets.get(key) ?? { amount: 0, transferCount: 0 };
    bucket.amount += tx.amount;
    bucket.transferCount += 1;
    buckets.set(key, bucket);
  }

  const sortedKeys = [...buckets.keys()].sort();
  const earliest = new Date(`${sortedKeys[0]}-01`);
  const now = new Date();
  const monthKeys = enumerateCalendarMonths(earliest, now);

  return monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const totals = buckets.get(monthKey) ?? { amount: 0, transferCount: 0 };

    return {
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      amount: Math.round(totals.amount * 100) / 100,
      transferCount: totals.transferCount,
    };
  });
}

export function sliceMonthlyTransferOverview(
  data: MonthlyTransferOverview[],
  period: MonthlyPeriod,
  locale: string,
): MonthlyTransferOverview[] {
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
  const result: MonthlyTransferOverview[] = [];

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
      amount: 0,
      transferCount: 0,
    });
  }

  return result;
}

export function sumMonthlyTransferOverview(data: MonthlyTransferOverview[]) {
  return data.reduce(
    (acc, row) => ({
      amount: acc.amount + row.amount,
      transferCount: acc.transferCount + row.transferCount,
      monthsWithTransfer: acc.monthsWithTransfer + (row.amount > 0 ? 1 : 0),
    }),
    { amount: 0, transferCount: 0, monthsWithTransfer: 0 },
  );
}
