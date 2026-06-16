/**
 * @file recurring-detection.ts
 * @description Détection des prélèvements récurrents hors PayPal (libellé stable, pas de voies par jour).
 */

import {
  DEFAULT_PAYPAL_PATTERN,
  findMatchingRecurringPayment,
  getBookingDay,
  getBookingMonth,
  isPayPalDebit,
  MIN_SUGGESTION_OCCURRENCES,
  type RecurringCadence,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import {
  generalPatternsMatch,
  generalRecurringMatchPattern,
  GENERAL_RECURRING_AMOUNT_TOLERANCE,
  recurringGroupKey,
} from "@/lib/finance/recurring-labels";
import type {
  RecurringPayment,
  TransactionWithAccount,
} from "@/types/database";

const MIN_MONTHLY_OCCURRENCES = MIN_SUGGESTION_OCCURRENCES;
const MIN_YEARLY_OCCURRENCES = MIN_SUGGESTION_OCCURRENCES;
const AMOUNT_TOLERANCE = GENERAL_RECURRING_AMOUNT_TOLERANCE;

const DESCRIPTION_NOISE =
  /\b(PRLV|PRELEVEMENT|PRELEV|SEPA|VIREMENT|VIR INST|VIR|TIP|CB|CARTE|MANDAT|DEBIT|FACTURE|FACT|REF|MD\d+|ID\s+\d+|FR\d+|CORE)\b/gi;

type RecurringLaneTx = Pick<
  TransactionWithAccount,
  "id" | "amount" | "description" | "booking_date" | "recurring_payment_id"
>;

function roundDebitAmount(amount: number): number {
  return Math.round(Math.abs(amount) * 100) / 100;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function monthKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export { recurringGroupKey } from "@/lib/finance/recurring-labels";

export function extractMerchantKey(description: string): string {
  const cleaned = description
    .toUpperCase()
    .replace(DESCRIPTION_NOISE, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter((word) => word.length >= 3);
  return words.slice(0, 2).join(" ") || cleaned.slice(0, 16).trim();
}

function isGeneralRecurringDebit(description: string): boolean {
  const upper = description.trim().toUpperCase();

  if (upper.includes("PAYPAL") || upper.includes("VIREMENT EN VOTRE FAVEUR")) {
    return false;
  }

  if (/^VIREMENT EMIS WEB\b/.test(upper)) {
    return false;
  }

  return (
    /^PAIEMENT PAR CARTE\b/.test(upper) ||
    /^PRLV\b/.test(upper) ||
    /^PRELEVEMENT\b/.test(upper) ||
    /^PRELEV\b/.test(upper)
  );
}

function listUnidentifiedGeneralDebits(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
): RecurringLaneTx[] {
  return transactions.filter((tx) => {
    if (tx.amount >= 0 || isPayPalDebit(tx) || tx.recurring_payment_id) {
      return false;
    }

    if (!isGeneralRecurringDebit(tx.description)) {
      return false;
    }

    return !findMatchingRecurringPayment(tx, rules);
  });
}

function hasConsistentAmount(txs: RecurringLaneTx[]): boolean {
  const amounts = txs.map((tx) => roundDebitAmount(tx.amount));
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const median = medianOf(amounts);

  return max - min <= Math.max(AMOUNT_TOLERANCE, median * 0.05);
}

/** Conserve le prélèvement le plus récent de chaque mois calendaire. */
function dedupeOnePerMonth(txs: RecurringLaneTx[]): RecurringLaneTx[] {
  const byMonth = new Map<string, RecurringLaneTx>();

  for (const tx of txs) {
    const monthKey = tx.booking_date.slice(0, 7);
    const existing = byMonth.get(monthKey);
    if (!existing || tx.booking_date > existing.booking_date) {
      byMonth.set(monthKey, tx);
    }
  }

  return [...byMonth.values()].sort((a, b) =>
    a.booking_date.localeCompare(b.booking_date),
  );
}

function dedupeOnePerYear(txs: RecurringLaneTx[]): RecurringLaneTx[] {
  const byYear = new Map<string, RecurringLaneTx>();

  for (const tx of txs) {
    const yearKey = tx.booking_date.slice(0, 4);
    const existing = byYear.get(yearKey);
    if (!existing || tx.booking_date > existing.booking_date) {
      byYear.set(yearKey, tx);
    }
  }

  return [...byYear.values()].sort((a, b) =>
    a.booking_date.localeCompare(b.booking_date),
  );
}

function isRecentMonthlyRecurring(
  txs: RecurringLaneTx[],
  referenceDate = new Date(),
): boolean {
  const lastMonthKey = txs[txs.length - 1].booking_date.slice(0, 7);
  const previousMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1),
  );
  const currentMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
  );

  return lastMonthKey === previousMonthKey || lastMonthKey === currentMonthKey;
}

function isRecentYearlyRecurring(
  txs: RecurringLaneTx[],
  referenceDate = new Date(),
): boolean {
  const lastDate = new Date(txs[txs.length - 1].booking_date);
  const rollingYearStart = new Date(referenceDate);
  rollingYearStart.setFullYear(rollingYearStart.getFullYear() - 1);
  return lastDate >= rollingYearStart;
}

function buildSuggestionFromGroup(
  groupKey: string,
  txs: RecurringLaneTx[],
  cadence: RecurringCadence,
): RecurringClusterSuggestion {
  const sorted = [...txs].sort((a, b) =>
    a.booking_date.localeCompare(b.booking_date),
  );
  const latest = sorted[sorted.length - 1];
  const amount = roundDebitAmount(latest.amount);
  const billingDay = medianOf(
    sorted.map((tx) => getBookingDay(tx.booking_date)),
  );
  const billingMonth =
    cadence === "yearly"
      ? medianOf(sorted.map((tx) => getBookingMonth(tx.booking_date)))
      : null;
  const descriptionPreview = latest.description.trim().slice(0, 48) || groupKey;

  return {
    amount,
    billingDay,
    billingMonth,
    cadence,
    count: sorted.length,
    lastDate: latest.booking_date,
    descriptionPattern: generalRecurringMatchPattern(groupKey),
    descriptionPreview,
    source: "general",
  };
}

function isGroupCoveredByExistingRule(
  groupKey: string,
  amount: number,
  rules: RecurringPayment[],
): boolean {
  return rules.some((rule) => {
    if (
      rule.description_pattern.toUpperCase().includes(DEFAULT_PAYPAL_PATTERN)
    ) {
      return false;
    }

    if (!generalPatternsMatch(groupKey, rule.description_pattern)) {
      return false;
    }

    const tolerance = Math.max(
      rule.amount_tolerance,
      GENERAL_RECURRING_AMOUNT_TOLERANCE,
    );
    return Math.abs(rule.amount - amount) <= tolerance;
  });
}

function detectMonthlySuggestion(
  groupKey: string,
  txs: RecurringLaneTx[],
  referenceDate = new Date(),
): RecurringClusterSuggestion | null {
  const monthlyTxs = dedupeOnePerMonth(txs);
  if (monthlyTxs.length < MIN_MONTHLY_OCCURRENCES) {
    return null;
  }

  if (
    new Set(monthlyTxs.map((tx) => tx.booking_date.slice(0, 7))).size <
    MIN_MONTHLY_OCCURRENCES
  ) {
    return null;
  }

  if (!isRecentMonthlyRecurring(monthlyTxs, referenceDate)) {
    return null;
  }

  return buildSuggestionFromGroup(groupKey, monthlyTxs, "monthly");
}

function detectYearlySuggestion(
  groupKey: string,
  txs: RecurringLaneTx[],
  referenceDate = new Date(),
): RecurringClusterSuggestion | null {
  const yearlyTxs = dedupeOnePerYear(txs);
  if (yearlyTxs.length < MIN_YEARLY_OCCURRENCES) {
    return null;
  }

  if (
    new Set(yearlyTxs.map((tx) => tx.booking_date.slice(0, 4))).size <
    MIN_YEARLY_OCCURRENCES
  ) {
    return null;
  }

  if (!isRecentYearlyRecurring(yearlyTxs, referenceDate)) {
    return null;
  }

  return buildSuggestionFromGroup(groupKey, yearlyTxs, "yearly");
}

export function listUnknownGeneralRecurringClusters(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
  referenceDate = new Date(),
): RecurringClusterSuggestion[] {
  const unidentified = listUnidentifiedGeneralDebits(transactions, rules);
  const groups = new Map<string, RecurringLaneTx[]>();

  for (const tx of unidentified) {
    const groupKey = recurringGroupKey(tx.description);
    if (groupKey.length < 3) {
      continue;
    }

    const group = groups.get(groupKey) ?? [];
    group.push(tx);
    groups.set(groupKey, group);
  }

  const suggestions: RecurringClusterSuggestion[] = [];

  for (const [groupKey, groupTxs] of groups.entries()) {
    if (!hasConsistentAmount(groupTxs)) {
      continue;
    }

    const representativeAmount = roundDebitAmount(
      groupTxs[groupTxs.length - 1].amount,
    );
    if (isGroupCoveredByExistingRule(groupKey, representativeAmount, rules)) {
      continue;
    }

    const monthly = detectMonthlySuggestion(groupKey, groupTxs, referenceDate);
    if (monthly) {
      suggestions.push(monthly);
      continue;
    }

    const yearly = detectYearlySuggestion(groupKey, groupTxs, referenceDate);
    if (yearly) {
      suggestions.push(yearly);
    }
  }

  return suggestions.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export function isGeneralRecurringClusterStillActive(
  transactions: Pick<
    TransactionWithAccount,
    "amount" | "description" | "booking_date" | "recurring_payment_id"
  >[],
  rules: RecurringPayment[],
  suggestion: Pick<
    RecurringClusterSuggestion,
    "amount" | "billingDay" | "billingMonth" | "cadence" | "descriptionPattern"
  >,
  referenceDate = new Date(),
): boolean {
  const suggestions = listUnknownGeneralRecurringClusters(
    transactions as TransactionWithAccount[],
    rules,
    referenceDate,
  );
  return suggestions.some(
    (candidate) =>
      candidate.amount === suggestion.amount &&
      candidate.cadence === suggestion.cadence &&
      candidate.billingDay === suggestion.billingDay &&
      candidate.billingMonth === suggestion.billingMonth &&
      candidate.descriptionPattern.toUpperCase() ===
        suggestion.descriptionPattern.toUpperCase(),
  );
}

export function isPayPalPattern(pattern: string): boolean {
  return pattern.trim().toUpperCase().includes(DEFAULT_PAYPAL_PATTERN);
}
