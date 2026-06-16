/**
 * @file recurring-detection.ts
 * @description Détection des prélèvements récurrents hors PayPal (mensuel / annuel).
 */

import {
  BILLING_DAY_TOLERANCE,
  DEFAULT_PAYPAL_PATTERN,
  dayDistance,
  findMatchingRecurringPayment,
  getBookingDay,
  isPayPalDebit,
  type RecurringCadence,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import type { RecurringPayment, TransactionWithAccount } from "@/types/database";

const MIN_MONTHLY_OCCURRENCES = 3;
const MIN_YEARLY_OCCURRENCES = 2;

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

function getBookingMonth(bookingDate: string): number {
  return Number(bookingDate.slice(5, 7));
}

function monthDistance(monthA: number, monthB: number): number {
  const diff = Math.abs(monthA - monthB);
  return Math.min(diff, 12 - diff);
}

function descriptionMatchesMerchantKey(description: string, merchantKey: string): boolean {
  if (!merchantKey) {
    return true;
  }

  return (
    extractMerchantKey(description) === merchantKey ||
    description.toUpperCase().includes(merchantKey)
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

    return !findMatchingRecurringPayment(tx, rules);
  });
}

function inferCadence(txs: RecurringLaneTx[]): RecurringCadence | null {
  const dates = txs.map((tx) => tx.booking_date).sort();
  const monthKeys = new Set(dates.map((date) => date.slice(0, 7)));
  const years = new Set(dates.map((date) => date.slice(0, 4)));

  if (dates.length >= MIN_MONTHLY_OCCURRENCES && monthKeys.size >= MIN_MONTHLY_OCCURRENCES) {
    return "monthly";
  }

  if (dates.length >= MIN_YEARLY_OCCURRENCES && years.size >= MIN_YEARLY_OCCURRENCES) {
    const gaps: number[] = [];
    for (let index = 1; index < dates.length; index += 1) {
      const previous = new Date(dates[index - 1]);
      const current = new Date(dates[index]);
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

  if (dates.length >= 2) {
    const gaps: number[] = [];
    for (let index = 1; index < dates.length; index += 1) {
      const previous = new Date(dates[index - 1]);
      const current = new Date(dates[index]);
      gaps.push(
        Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    const monthlyGaps = gaps.filter((gap) => gap >= 25 && gap <= 38);
    if (monthlyGaps.length >= gaps.length * 0.6) {
      return "monthly";
    }
  }

  return null;
}

function splitMonthlyLanes(txs: RecurringLaneTx[]): RecurringLaneTx[][] {
  const sorted = [...txs].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const lanes: RecurringLaneTx[][] = [];

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

      const laneDay = medianOf(lane.map((entry) => getBookingDay(entry.booking_date)));
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

function laneYearAnchor(lane: RecurringLaneTx[]): { month: number; day: number } {
  return {
    month: medianOf(lane.map((tx) => getBookingMonth(tx.booking_date))),
    day: medianOf(lane.map((tx) => getBookingDay(tx.booking_date))),
  };
}

function matchesYearlySlot(
  bookingDate: string,
  anchor: { month: number; day: number },
): boolean {
  return (
    monthDistance(getBookingMonth(bookingDate), anchor.month) <= 1 &&
    dayDistance(getBookingDay(bookingDate), anchor.day) <= BILLING_DAY_TOLERANCE
  );
}

function splitYearlyLanes(txs: RecurringLaneTx[]): RecurringLaneTx[][] {
  const sorted = [...txs].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const lanes: RecurringLaneTx[][] = [];

  for (const tx of sorted) {
    const year = tx.booking_date.slice(0, 4);

    let bestLaneIndex = -1;
    let bestScore = Infinity;

    for (let index = 0; index < lanes.length; index += 1) {
      const lane = lanes[index];
      if (lane.some((entry) => entry.booking_date.slice(0, 4) === year)) {
        continue;
      }

      const anchor = laneYearAnchor(lane);
      const score =
        monthDistance(getBookingMonth(tx.booking_date), anchor.month) * 32 +
        dayDistance(getBookingDay(tx.booking_date), anchor.day);

      if (matchesYearlySlot(tx.booking_date, anchor) && score < bestScore) {
        bestScore = score;
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

function isMonthlyLaneStillActive(
  lane: Pick<TransactionWithAccount, "booking_date">[],
  referenceDate = new Date(),
): boolean {
  if (lane.length === 0) {
    return false;
  }

  const previousMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1),
  );
  const currentMonthKey = monthKeyFromDate(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
  );

  if (lane.some((tx) => tx.booking_date.slice(0, 7) === previousMonthKey)) {
    return true;
  }

  return lane.every((tx) => tx.booking_date.slice(0, 7) === currentMonthKey);
}

function isYearlyLaneStillActive(
  lane: RecurringLaneTx[],
  anchor: { month: number; day: number },
  referenceDate = new Date(),
): boolean {
  if (lane.length === 0) {
    return false;
  }

  const previousYear = referenceDate.getFullYear() - 1;
  const currentYear = referenceDate.getFullYear();

  const hasPreviousYear = lane.some((tx) => {
    const date = new Date(tx.booking_date);
    return date.getFullYear() === previousYear && matchesYearlySlot(tx.booking_date, anchor);
  });
  if (hasPreviousYear) {
    return true;
  }

  return lane.every((tx) => new Date(tx.booking_date).getFullYear() === currentYear);
}

function buildSuggestionFromLane(
  lane: RecurringLaneTx[],
  cadence: RecurringCadence,
  merchantKey: string,
): RecurringClusterSuggestion | null {
  const amount = roundDebitAmount(lane[0].amount);
  const billingDay = medianOf(lane.map((tx) => getBookingDay(tx.booking_date)));
  const billingMonth =
    cadence === "yearly"
      ? medianOf(lane.map((tx) => getBookingMonth(tx.booking_date)))
      : null;
  const anchor = { month: billingMonth ?? getBookingMonth(lane[0].booking_date), day: billingDay };

  const minCount = cadence === "yearly" ? MIN_YEARLY_OCCURRENCES : MIN_MONTHLY_OCCURRENCES;
  if (lane.length < minCount) {
    return null;
  }

  const stillActive =
    cadence === "yearly"
      ? isYearlyLaneStillActive(lane, anchor)
      : isMonthlyLaneStillActive(lane);
  if (!stillActive) {
    return null;
  }

  const sortedDescriptions = [...lane]
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date))
    .map((tx) => tx.description.trim());
  const descriptionPreview = sortedDescriptions[0]?.slice(0, 48) ?? merchantKey;

  return {
    amount,
    billingDay,
    billingMonth,
    cadence,
    count: lane.length,
    lastDate: lane.reduce(
      (latest, tx) => (tx.booking_date > latest ? tx.booking_date : latest),
      lane[0].booking_date,
    ),
    descriptionPattern: merchantKey,
    descriptionPreview,
    source: "general",
  };
}

export function listUnknownGeneralRecurringClusters(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
): RecurringClusterSuggestion[] {
  const unidentified = listUnidentifiedGeneralDebits(transactions, rules);
  const groups = new Map<string, RecurringLaneTx[]>();

  for (const tx of unidentified) {
    const merchantKey = extractMerchantKey(tx.description);
    if (merchantKey.length < 3) {
      continue;
    }

    const amount = roundDebitAmount(tx.amount);
    const groupKey = `${amount}|${merchantKey}`;
    const group = groups.get(groupKey) ?? [];
    group.push(tx);
    groups.set(groupKey, group);
  }

  const suggestions: RecurringClusterSuggestion[] = [];

  for (const [groupKey, groupTxs] of groups.entries()) {
    const merchantKey = groupKey.split("|").slice(1).join("|");
    const consistent = groupTxs.every((tx) =>
      descriptionMatchesMerchantKey(tx.description, merchantKey),
    );
    if (!consistent) {
      continue;
    }

    const cadence = inferCadence(groupTxs);
    if (!cadence) {
      continue;
    }

    const lanes = cadence === "yearly" ? splitYearlyLanes(groupTxs) : splitMonthlyLanes(groupTxs);

    for (const lane of lanes) {
      const suggestion = buildSuggestionFromLane(lane, cadence, merchantKey);
      if (suggestion) {
        suggestions.push(suggestion);
      }
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
