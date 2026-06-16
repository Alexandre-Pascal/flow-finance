/**
 * @file category-analytics.ts
 * @description Agrégation des dépenses par catégorie et par mois calendaire.
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import type { TransactionWithAccount } from "@/types/database";

/** Clé spéciale regroupant toutes les transactions liées à un abonnement. */
export const SUBSCRIPTIONS_KEY = "__subscriptions__";
/** Clé spéciale pour les dépenses sans catégorie. */
export const UNCATEGORIZED_KEY = "__uncategorized__";
/** Clé spéciale pour le regroupement « Autres » côté affichage. */
export const OTHER_KEY = "__other__";

export const SUBSCRIPTIONS_COLOR = "#1E3A8A";
export const UNCATEGORIZED_COLOR = "#CBD5E1";
export const OTHER_COLOR = "#64748B";

export interface CategoryMeta {
  name: string;
  color: string;
}

export interface MonthlyCategoryRow {
  monthKey: string;
  month: string;
  monthFull: string;
  total: number;
  values: Record<string, number>;
}

export interface CategoryBreakdown {
  months: MonthlyCategoryRow[];
  meta: Record<string, CategoryMeta>;
}

interface BreakdownLabels {
  subscriptions: string;
  uncategorized: string;
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

function resolveBucket(
  tx: TransactionWithAccount,
  labels: BreakdownLabels,
): CategoryMeta & { key: string } {
  if (tx.recurring_payment_id) {
    return {
      key: SUBSCRIPTIONS_KEY,
      name: labels.subscriptions,
      color: SUBSCRIPTIONS_COLOR,
    };
  }

  if (tx.category_id && tx.category_name) {
    return {
      key: tx.category_id,
      name: tx.category_name,
      color: tx.category_color ?? OTHER_COLOR,
    };
  }

  return {
    key: UNCATEGORIZED_KEY,
    name: labels.uncategorized,
    color: UNCATEGORIZED_COLOR,
  };
}

/**
 * Agrège les dépenses (montants négatifs) par catégorie et par mois calendaire.
 * Les transactions liées à un abonnement sont regroupées dans une série dédiée,
 * et les dépenses non catégorisées dans une série « Non classé ».
 */
export function buildCategoryBreakdown(
  transactions: TransactionWithAccount[],
  locale: string,
  labels: BreakdownLabels,
): CategoryBreakdown {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "short",
  });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });
  const now = new Date();

  const meta: Record<string, CategoryMeta> = {};
  const buckets = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (tx.amount >= 0) {
      continue;
    }

    const monthKey = tx.booking_date.slice(0, 7);
    const bucket = resolveBucket(tx, labels);
    meta[bucket.key] = { name: bucket.name, color: bucket.color };

    const monthBucket = buckets.get(monthKey) ?? new Map<string, number>();
    monthBucket.set(
      bucket.key,
      (monthBucket.get(bucket.key) ?? 0) + Math.abs(tx.amount),
    );
    buckets.set(monthKey, monthBucket);
  }

  if (buckets.size === 0) {
    return { months: [], meta };
  }

  const sortedKeys = [...buckets.keys()].sort();
  const earliest = new Date(`${sortedKeys[0]}-01`);
  const monthKeys = enumerateCalendarMonths(earliest, now);

  const months = monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const monthBucket = buckets.get(monthKey);
    const values: Record<string, number> = {};
    let total = 0;

    if (monthBucket) {
      for (const [key, value] of monthBucket) {
        const rounded = Math.round(value * 100) / 100;
        values[key] = rounded;
        total += rounded;
      }
    }

    return {
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      total: Math.round(total * 100) / 100,
      values,
    };
  });

  return { months, meta };
}

/** Restreint les mois au nombre demandé (6 / 12 / tout). */
export function sliceCategoryMonths(
  months: MonthlyCategoryRow[],
  period: MonthlyPeriod,
): MonthlyCategoryRow[] {
  if (period === "all") {
    return months;
  }

  return months.slice(-period);
}

export interface CategoryTotal {
  key: string;
  name: string;
  color: string;
  total: number;
  share: number;
  lastMonth: number;
  previousMonth: number;
}

/**
 * Calcule le total par catégorie sur une plage de mois, trié décroissant,
 * avec part relative et valeurs du dernier / avant-dernier mois.
 */
export function computeCategoryTotals(
  months: MonthlyCategoryRow[],
  meta: Record<string, CategoryMeta>,
): CategoryTotal[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const month of months) {
    for (const [key, value] of Object.entries(month.values)) {
      totals.set(key, (totals.get(key) ?? 0) + value);
      grandTotal += value;
    }
  }

  const lastMonth = months.at(-1);
  const previousMonth = months.at(-2);

  return [...totals.entries()]
    .map(([key, total]) => ({
      key,
      name: meta[key]?.name ?? key,
      color: meta[key]?.color ?? OTHER_COLOR,
      total: Math.round(total * 100) / 100,
      share: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0,
      lastMonth: lastMonth?.values[key] ?? 0,
      previousMonth: previousMonth?.values[key] ?? 0,
    }))
    .sort((a, b) => b.total - a.total);
}
