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
/** Tolérance pour regrouper les suggestions (plusieurs abonnements au même montant). */
export const BILLING_DAY_TOLERANCE = 3;
/** Tolérance pour rattacher une transaction à une règle enregistrée (plus stricte). */
export const RULE_MATCH_DAY_TOLERANCE = 1;
export const MIN_SUGGESTION_OCCURRENCES = 2;

export type RecurringCadence = "monthly" | "yearly";

export interface RecurringClusterSuggestion {
  amount: number;
  billingDay: number;
  billingMonth: number | null;
  cadence: RecurringCadence;
  count: number;
  lastDate: string;
  descriptionPattern: string;
  descriptionPreview: string;
  source: "paypal" | "general";
}

export type PayPalClusterSuggestion = RecurringClusterSuggestion;

/** @deprecated Use PayPalClusterSuggestion */
export type PayPalAmountSuggestion = PayPalClusterSuggestion;

export interface MonthlySubscriptionRow {
  monthKey: string;
  month: string;
  monthFull: string;
  total: number;
  items: { id: string; name: string; amount: number }[];
}

export interface ActiveSubscriptionRow {
  id: string;
  name: string;
  cadence: RecurringCadence;
  monthlyAmount: number;
  billingAmount: number;
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
    cadence: row.cadence === "yearly" ? "yearly" : "monthly",
    billing_month:
      row.billing_month === null || row.billing_month === undefined
        ? null
        : Number(row.billing_month),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function getBookingDay(bookingDate: string): number {
  return Number(bookingDate.slice(8, 10));
}

export function getBookingMonth(bookingDate: string): number {
  return Number(bookingDate.slice(5, 7));
}

export function monthDistance(monthA: number, monthB: number): number {
  const diff = Math.abs(monthA - monthB);
  return Math.min(diff, 12 - diff);
}

export function dayDistance(dayA: number, dayB: number): number {
  const diff = Math.abs(dayA - dayB);
  return Math.min(diff, 31 - diff);
}

type PayPalLaneTx = Pick<
  TransactionWithAccount,
  "id" | "amount" | "description" | "booking_date" | "recurring_payment_id"
>;

function roundPayPalAmount(amount: number): number {
  return Math.round(Math.abs(amount) * 100) / 100;
}

function medianDay(days: number[]): number {
  const sorted = [...days].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function listUnidentifiedPayPalDebits(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
): PayPalLaneTx[] {
  return transactions.filter((tx) => {
    if (!isPayPalDebit(tx) || tx.recurring_payment_id) {
      return false;
    }

    return !findMatchingRecurringPayment(tx, rules);
  });
}

/**
 * Sépare les prélèvements d'un même montant en « voies » distinctes :
 * au plus une transaction par mois calendaire par voie (deux abonnements
 * identiques en montant apparaissent comme deux doubles mensuels).
 */
function splitPayPalAmountIntoLanes(txs: PayPalLaneTx[]): PayPalLaneTx[][] {
  const sorted = [...txs].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const lanes: PayPalLaneTx[][] = [];

  for (const tx of sorted) {
    const monthKey = tx.booking_date.slice(0, 7);
    const txDay = getBookingDay(tx.booking_date);

    let bestLaneIndex = -1;
    let bestDistance = Infinity;

    for (let index = 0; index < lanes.length; index += 1) {
      const lane = lanes[index];
      if (lane.some((entry) => entry.booking_date.slice(0, 7) === monthKey)) {
        continue;
      }

      const laneDay = medianDay(lane.map((entry) => getBookingDay(entry.booking_date)));
      const distance = dayDistance(txDay, laneDay);
      if (distance <= BILLING_DAY_TOLERANCE && distance < bestDistance) {
        bestDistance = distance;
        bestLaneIndex = index;
      }
    }

    if (bestLaneIndex >= 0) {
      lanes[bestLaneIndex].push(tx);
      continue;
    }

    lanes.push([tx]);
  }

  return lanes.filter((lane) => lane.length > 0);
}

function laneBillingDay(lane: PayPalLaneTx[]): number {
  return medianDay(lane.map((tx) => getBookingDay(tx.booking_date)));
}

function findPayPalLaneByBillingDay(
  lanes: PayPalLaneTx[][],
  billingDay: number,
): PayPalLaneTx[] | null {
  let bestLane: PayPalLaneTx[] | null = null;
  let bestDistance = Infinity;

  for (const lane of lanes) {
    const distance = dayDistance(laneBillingDay(lane), billingDay);
    if (distance <= BILLING_DAY_TOLERANCE && distance < bestDistance) {
      bestDistance = distance;
      bestLane = lane;
    }
  }

  return bestLane;
}

/**
 * Un cluster est proposable s'il compte au moins deux prélèvements,
 * ou un seul datant du mois calendaire précédent (nouvel abonnement probable).
 */
export function isLaneSuggestible(
  lane: Pick<TransactionWithAccount, "booking_date">[],
  referenceDate = new Date(),
): boolean {
  if (lane.length >= MIN_SUGGESTION_OCCURRENCES) {
    return true;
  }

  if (lane.length !== 1) {
    return false;
  }

  const previousMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1),
  );
  return lane[0].booking_date.slice(0, 7) === previousMonthKey;
}

export function transactionMatchesPayPalCluster(
  tx: Pick<TransactionWithAccount, "amount" | "description" | "booking_date">,
  amount: number,
  billingDay: number,
): boolean {
  if (tx.amount >= 0) {
    return false;
  }

  if (!tx.description.toUpperCase().includes(DEFAULT_PAYPAL_PATTERN)) {
    return false;
  }

  const txAmount = Math.round(Math.abs(tx.amount) * 100) / 100;
  if (txAmount !== amount) {
    return false;
  }

  return dayDistance(getBookingDay(tx.booking_date), billingDay) <= BILLING_DAY_TOLERANCE;
}

/**
 * Vérifie qu'un cluster PayPal correspond encore à une suggestion affichée.
 */
export function isPayPalClusterStillActive(
  transactions: PayPalLaneTx[],
  amount: number,
  billingDay: number,
  referenceDate = new Date(),
  rules: RecurringPayment[] = [],
): boolean {
  const unidentified = rules.length
    ? listUnidentifiedPayPalDebits(transactions as TransactionWithAccount[], rules)
    : transactions.filter(
        (tx) =>
          tx.amount < 0 &&
          tx.description.toUpperCase().includes(DEFAULT_PAYPAL_PATTERN) &&
          !tx.recurring_payment_id,
      );

  const amountTxs = unidentified.filter(
    (tx) => roundPayPalAmount(tx.amount) === amount,
  );
  const lane = findPayPalLaneByBillingDay(
    splitPayPalAmountIntoLanes(amountTxs),
    billingDay,
  );

  if (!lane) {
    return false;
  }

  return isLaneSuggestible(lane, referenceDate);
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

  const cadence = rule.cadence ?? "monthly";

  if (cadence === "yearly") {
    if (rule.billing_month !== null) {
      const txMonth = getBookingMonth(tx.booking_date);
      if (monthDistance(txMonth, rule.billing_month) > 1) {
        return false;
      }
    }

    if (rule.billing_day === null) {
      return true;
    }

    const txDay = getBookingDay(tx.booking_date);
    return dayDistance(txDay, rule.billing_day) <= RULE_MATCH_DAY_TOLERANCE;
  }

  if (rule.billing_day === null) {
    return true;
  }

  const txDay = getBookingDay(tx.booking_date);
  return dayDistance(txDay, rule.billing_day) <= RULE_MATCH_DAY_TOLERANCE;
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
  const txMonth = getBookingMonth(tx.booking_date);
  const withBillingDay = amountMatches.filter((rule) => rule.billing_day !== null);

  if (withBillingDay.length > 0) {
    let best: RecurringPayment | null = null;
    let bestDistance = Infinity;

    for (const rule of withBillingDay) {
      const dayDistanceValue = dayDistance(txDay, rule.billing_day!);
      const monthDistanceValue =
        rule.cadence === "yearly" && rule.billing_month !== null
          ? monthDistance(txMonth, rule.billing_month)
          : 0;
      const distance = rule.cadence === "yearly" ? monthDistanceValue * 32 + dayDistanceValue : dayDistanceValue;

      if (
        (rule.cadence === "yearly"
          ? monthDistanceValue <= 1 && dayDistanceValue <= RULE_MATCH_DAY_TOLERANCE
          : dayDistanceValue <= RULE_MATCH_DAY_TOLERANCE) &&
        distance < bestDistance
      ) {
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
  const unidentified = listUnidentifiedPayPalDebits(transactions, rules);
  const byAmount = new Map<number, PayPalLaneTx[]>();

  for (const tx of unidentified) {
    const amount = roundPayPalAmount(tx.amount);
    const group = byAmount.get(amount) ?? [];
    group.push(tx);
    byAmount.set(amount, group);
  }

  const suggestions: PayPalClusterSuggestion[] = [];

  for (const [amount, amountTxs] of byAmount.entries()) {
    for (const lane of splitPayPalAmountIntoLanes(amountTxs)) {
      const billingDay = laneBillingDay(lane);

      if (!isLaneSuggestible(lane)) {
        continue;
      }

      suggestions.push({
        amount,
        billingDay,
        billingMonth: null,
        cadence: "monthly",
        count: lane.length,
        lastDate: lane.reduce(
          (latest, tx) => (tx.booking_date > latest ? tx.booking_date : latest),
          lane[0].booking_date,
        ),
        descriptionPattern: DEFAULT_PAYPAL_PATTERN,
        descriptionPreview: "PayPal",
        source: "paypal",
      });
    }
  }

  return suggestions.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export function clusterSuggestionKey(suggestion: RecurringClusterSuggestion): string {
  return `${clusterDismissalKey(suggestion)}-${suggestion.lastDate}`;
}

/** Clé stable pour ignorer une suggestion (sans date du dernier prélèvement). */
export function clusterDismissalKey(suggestion: RecurringClusterSuggestion): string {
  return [
    suggestion.source,
    suggestion.cadence,
    suggestion.amount.toFixed(2),
    String(suggestion.billingDay),
    suggestion.billingMonth === null ? "x" : String(suggestion.billingMonth),
    suggestion.descriptionPattern.trim().toUpperCase(),
  ].join("|");
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

export function inferCadenceFromPaymentDates(dates: string[]): RecurringCadence | null {
  const sorted = [...dates].sort();
  const monthKeys = new Set(sorted.map((date) => date.slice(0, 7)));
  const years = new Set(sorted.map((date) => date.slice(0, 4)));

  if (sorted.length >= MIN_SUGGESTION_OCCURRENCES && monthKeys.size >= MIN_SUGGESTION_OCCURRENCES) {
    const gaps: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = new Date(sorted[index - 1]);
      const current = new Date(sorted[index]);
      gaps.push(
        Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    const monthlyGaps = gaps.filter((gap) => gap >= 25 && gap <= 38);
    if (monthlyGaps.length >= gaps.length * 0.6) {
      return "monthly";
    }
  }

  if (sorted.length >= MIN_SUGGESTION_OCCURRENCES && years.size >= MIN_SUGGESTION_OCCURRENCES) {
    const gaps: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = new Date(sorted[index - 1]);
      const current = new Date(sorted[index]);
      gaps.push(
        Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    const yearlyGaps = gaps.filter((gap) => gap >= 335 && gap <= 395);
    if (yearlyGaps.length >= Math.max(1, gaps.length * 0.5)) {
      return "yearly";
    }

    if (monthKeys.size <= years.size + 1) {
      return "yearly";
    }
  }

  if (sorted.length >= 2) {
    const gaps: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = new Date(sorted[index - 1]);
      const current = new Date(sorted[index]);
      gaps.push(
        Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    const yearlyGaps = gaps.filter((gap) => gap >= 335 && gap <= 395);
    if (yearlyGaps.length >= Math.max(1, gaps.length * 0.5)) {
      return "yearly";
    }

    const monthlyGaps = gaps.filter((gap) => gap >= 25 && gap <= 38);
    if (monthlyGaps.length >= gaps.length * 0.6) {
      return "monthly";
    }
  }

  return null;
}

export function resolveEffectiveCadence(
  rule: RecurringPayment,
  paymentDates: string[],
): RecurringCadence {
  if (rule.cadence === "yearly") {
    return "yearly";
  }

  const inferred = inferCadenceFromPaymentDates(paymentDates);
  if (inferred === "yearly") {
    return "yearly";
  }

  return rule.cadence ?? "monthly";
}

export function listActiveSubscriptions(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
  locale: string,
  referenceDate = new Date(),
): ActiveSubscriptionRow[] {
  const previousMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1),
  );
  const currentMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
  );
  const rollingYearStart = new Date(referenceDate);
  rollingYearStart.setFullYear(rollingYearStart.getFullYear() - 1);

  const lastPaymentByRule = new Map<string, string>();
  const paymentDatesByRule = new Map<string, string[]>();

  for (const tx of transactions) {
    if (tx.amount >= 0 || !tx.recurring_payment_id) {
      continue;
    }

    const dates = paymentDatesByRule.get(tx.recurring_payment_id) ?? [];
    dates.push(tx.booking_date);
    paymentDatesByRule.set(tx.recurring_payment_id, dates);

    const existing = lastPaymentByRule.get(tx.recurring_payment_id);
    if (!existing || tx.booking_date > existing) {
      lastPaymentByRule.set(tx.recurring_payment_id, tx.booking_date);
    }
  }

  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const active: ActiveSubscriptionRow[] = [];

  for (const rule of rules) {
    const lastPaymentDate = lastPaymentByRule.get(rule.id);
    if (!lastPaymentDate) {
      continue;
    }

    const cadence = resolveEffectiveCadence(
      rule,
      paymentDatesByRule.get(rule.id) ?? [],
    );
    const paymentDate = new Date(lastPaymentDate);
    const paymentMonthKey = lastPaymentDate.slice(0, 7);
    const isActive =
      cadence === "yearly"
        ? paymentDate >= rollingYearStart
        : paymentMonthKey === previousMonthKey || paymentMonthKey === currentMonthKey;

    if (!isActive) {
      continue;
    }

    active.push({
      id: rule.id,
      name: rule.name,
      cadence,
      billingAmount: rule.amount,
      monthlyAmount:
        cadence === "yearly"
          ? Math.round((rule.amount / 12) * 100) / 100
          : rule.amount,
    });
  }

  return active.sort((a, b) => a.name.localeCompare(b.name, intlLocale));
}

/** @deprecated Use listActiveSubscriptions */
export function listActiveSubscriptionsLastMonth(
  data: MonthlySubscriptionRow[],
  locale: string,
  referenceDate = new Date(),
): MonthlySubscriptionRow["items"] {
  const previousMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1),
  );
  const row = data.find((entry) => entry.monthKey === previousMonthKey);
  if (!row) {
    return [];
  }

  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  return [...row.items].sort((a, b) => a.name.localeCompare(b.name, intlLocale));
}
