/**
 * @file recurring-payments.ts
 * @description Règles d'abonnements (matching par montant + libellé PayPal).
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import type {
  RecurringPayment,
  TransactionWithAccount,
} from "@/types/database";

export const DEFAULT_PAYPAL_PATTERN = "PAYPAL";

export interface PayPalAmountSuggestion {
  amount: number;
  count: number;
  lastDate: string;
}

export interface MonthlySubscriptionRow {
  monthKey: string;
  month: string;
  monthFull: string;
  total: number;
  items: { id: string; name: string; amount: number }[];
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

export function mapRecurringPayment(row: Record<string, unknown>): RecurringPayment {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    amount: Number(row.amount),
    amount_tolerance: Number(row.amount_tolerance),
    description_pattern: String(row.description_pattern),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function isPayPalDebit(tx: TransactionWithAccount): boolean {
  return (
    tx.amount < 0 &&
    tx.description.toUpperCase().includes(DEFAULT_PAYPAL_PATTERN)
  );
}

export function matchesRecurringPayment(
  tx: Pick<TransactionWithAccount, "amount" | "description">,
  rule: RecurringPayment,
): boolean {
  if (tx.amount >= 0) {
    return false;
  }

  const absAmount = Math.abs(tx.amount);
  const pattern = rule.description_pattern.trim().toUpperCase();

  if (pattern && !tx.description.toUpperCase().includes(pattern)) {
    return false;
  }

  return Math.abs(absAmount - rule.amount) <= rule.amount_tolerance;
}

export function findMatchingRecurringPayment(
  tx: Pick<TransactionWithAccount, "amount" | "description">,
  rules: RecurringPayment[],
): RecurringPayment | null {
  for (const rule of rules) {
    if (matchesRecurringPayment(tx, rule)) {
      return rule;
    }
  }

  return null;
}

export function listUnknownPayPalAmounts(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
): PayPalAmountSuggestion[] {
  const buckets = new Map<string, PayPalAmountSuggestion>();

  for (const tx of transactions) {
    if (!isPayPalDebit(tx)) {
      continue;
    }

    if (tx.recurring_payment_id) {
      continue;
    }

    if (findMatchingRecurringPayment(tx, rules)) {
      continue;
    }

    const amount = Math.round(Math.abs(tx.amount) * 100) / 100;
    const key = amount.toFixed(2);
    const existing = buckets.get(key);

    if (existing) {
      existing.count += 1;
      if (tx.booking_date > existing.lastDate) {
        existing.lastDate = tx.booking_date;
      }
      continue;
    }

    buckets.set(key, {
      amount,
      count: 1,
      lastDate: tx.booking_date,
    });
  }

  return [...buckets.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export function buildMonthlySubscriptionOverview(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
  locale: string,
): MonthlySubscriptionRow[] {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const buckets = new Map<
    string,
    Map<string, { name: string; amount: number }>
  >();

  for (const tx of transactions) {
    if (tx.amount >= 0 || !tx.recurring_payment_id) {
      continue;
    }

    const rule = ruleById.get(tx.recurring_payment_id);
    if (!rule) {
      continue;
    }

    const monthKey = tx.booking_date.slice(0, 7);
    const monthBucket =
      buckets.get(monthKey) ??
      new Map<string, { name: string; amount: number }>();
    const existing = monthBucket.get(rule.id);

    monthBucket.set(rule.id, {
      name: rule.name,
      amount: Math.round(((existing?.amount ?? 0) + Math.abs(tx.amount)) * 100) / 100,
    });
    buckets.set(monthKey, monthBucket);
  }

  if (buckets.size === 0) {
    return [];
  }

  const sortedKeys = [...buckets.keys()].sort();
  const earliest = new Date(`${sortedKeys[0]}-01`);
  const now = new Date();
  const monthKeys = enumerateCalendarMonths(earliest, now);

  return monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const monthBucket = buckets.get(monthKey);
    const items = monthBucket
      ? [...monthBucket.entries()].map(([id, item]) => ({ id, ...item }))
      : [];
    const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

    return {
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      total,
      items: items.sort((a, b) => b.amount - a.amount),
    };
  });
}

export function sliceMonthlySubscriptionOverview(
  data: MonthlySubscriptionRow[],
  period: MonthlyPeriod,
  locale: string,
): MonthlySubscriptionRow[] {
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
  const result: MonthlySubscriptionRow[] = [];

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
      total: 0,
      items: [],
    });
  }

  return result;
}
