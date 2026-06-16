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
export const BILLING_DAY_TOLERANCE = 3;

export interface PayPalClusterSuggestion {
  amount: number;
  billingDay: number;
  count: number;
  lastDate: string;
}

/** @deprecated Use PayPalClusterSuggestion */
export type PayPalAmountSuggestion = PayPalClusterSuggestion;

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
    billing_day:
      row.billing_day === null || row.billing_day === undefined
        ? null
        : Number(row.billing_day),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function getBookingDay(bookingDate: string): number {
  return Number(bookingDate.slice(8, 10));
}

export function dayDistance(dayA: number, dayB: number): number {
  const diff = Math.abs(dayA - dayB);
  return Math.min(diff, 31 - diff);
}

function clusterBookingDays(days: number[], gap = 5): number[][] {
  if (days.length === 0) {
    return [];
  }

  const sorted = [...days].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = sorted[index - 1];
    const cluster = clusters[clusters.length - 1];

    if (current - previous <= gap) {
      cluster.push(current);
      continue;
    }

    clusters.push([current]);
  }

  return clusters;
}

function medianDay(days: number[]): number {
  const sorted = [...days].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function isPayPalDebit(tx: TransactionWithAccount): boolean {
  return (
    tx.amount < 0 &&
    tx.description.toUpperCase().includes(DEFAULT_PAYPAL_PATTERN)
  );
}

export function matchesRecurringPayment(
  tx: Pick<TransactionWithAccount, "amount" | "description" | "booking_date">,
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

  if (Math.abs(absAmount - rule.amount) > rule.amount_tolerance) {
    return false;
  }

  if (rule.billing_day === null) {
    return true;
  }

  const txDay = getBookingDay(tx.booking_date);
  return dayDistance(txDay, rule.billing_day) <= BILLING_DAY_TOLERANCE;
}

export function findMatchingRecurringPayment(
  tx: Pick<TransactionWithAccount, "amount" | "description" | "booking_date">,
  rules: RecurringPayment[],
): RecurringPayment | null {
  const amountMatches = rules.filter((rule) => matchesRecurringPayment(tx, rule));

  if (amountMatches.length === 0) {
    return null;
  }

  if (amountMatches.length === 1) {
    return amountMatches[0];
  }

  const txDay = getBookingDay(tx.booking_date);
  const withBillingDay = amountMatches.filter((rule) => rule.billing_day !== null);

  if (withBillingDay.length > 0) {
    let best: RecurringPayment | null = null;
    let bestDistance = Infinity;

    for (const rule of withBillingDay) {
      const distance = dayDistance(txDay, rule.billing_day!);
      if (distance <= BILLING_DAY_TOLERANCE && distance < bestDistance) {
        bestDistance = distance;
        best = rule;
      }
    }

    if (best) {
      return best;
    }
  }

  return amountMatches.find((rule) => rule.billing_day === null) ?? null;
}

export function listUnknownPayPalAmounts(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
): PayPalClusterSuggestion[] {
  const unidentified = transactions.filter((tx) => {
    if (!isPayPalDebit(tx) || tx.recurring_payment_id) {
      return false;
    }

    return !findMatchingRecurringPayment(tx, rules);
  });

  const byAmount = new Map<number, number[]>();

  for (const tx of unidentified) {
    const amount = Math.round(Math.abs(tx.amount) * 100) / 100;
    const days = byAmount.get(amount) ?? [];
    days.push(getBookingDay(tx.booking_date));
    byAmount.set(amount, days);
  }

  const suggestions: PayPalClusterSuggestion[] = [];

  for (const [amount, days] of byAmount.entries()) {
    for (const cluster of clusterBookingDays(days)) {
      const billingDay = medianDay(cluster);
      const txsForCluster = unidentified.filter((tx) => {
        const txAmount = Math.round(Math.abs(tx.amount) * 100) / 100;
        if (txAmount !== amount) {
          return false;
        }

        return dayDistance(getBookingDay(tx.booking_date), billingDay) <= BILLING_DAY_TOLERANCE;
      });

      if (txsForCluster.length === 0) {
        continue;
      }

      suggestions.push({
        amount,
        billingDay,
        count: txsForCluster.length,
        lastDate: txsForCluster.reduce(
          (latest, tx) => (tx.booking_date > latest ? tx.booking_date : latest),
          txsForCluster[0].booking_date,
        ),
      });
    }
  }

  return suggestions.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export function clusterSuggestionKey(suggestion: PayPalClusterSuggestion): string {
  return `${suggestion.amount.toFixed(2)}-${suggestion.billingDay}`;
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
