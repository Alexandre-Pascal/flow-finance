/**
 * @file tracked-transfers.ts
 * @description Suivi de virements récurrents identifiés par libellé bancaire.
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import { payrollBudgetMonthKey } from "@/lib/finance/payroll-budget";
import type { ProfileTrackedIncomeSource } from "@/lib/profile-settings";
import type { TransactionWithAccount } from "@/types/database";

/** Valeur de `income_source` qui rattache une transaction au salaire. */
export const PAYROLL_INCOME_KEY = "payroll";

/** Ce dont les détecteurs de rentrée ont besoin, rattachement manuel compris. */
export type IncomeCandidate = Pick<
  TransactionWithAccount,
  "amount" | "description"
> & { income_source?: string | null };

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
 * Formulations d'un virement reçu. Les banques françaises annoncent « VIREMENT
 * EN VOTRE FAVEUR », Revolut écrit « From Anaïs L » ou « Payment from … ».
 * N'étant interrogée que sur des crédits, la règle peut rester large.
 */
function descriptionLooksLikeIncomingTransfer(description: string): boolean {
  return (
    description.includes("VIREMENT EN VOTRE FAVEUR") ||
    description.includes("VOTRE FAVEUR") ||
    description.includes("VIR INST") ||
    description.startsWith("FROM ") ||
    description.includes("PAYMENT FROM") ||
    description.includes("TOPUP FROM") ||
    description.includes("TRANSFER FROM")
  );
}

function descriptionLooksLikeOutgoingTransfer(description: string): boolean {
  return (
    description.includes("VIREMENT EMIS") ||
    description.includes("VIR EMIS")
  );
}

/** Annulations / opérations techniques : pas une vraie rentrée. */
export function isNonIncomeTransferDescription(description: string): boolean {
  const upper = description.toUpperCase();
  return (
    upper.includes("ANNUL") ||
    upper.includes("OPE. DEBITRICES") ||
    upper.includes("OPE DEBITRICES") ||
    upper.includes("ANNULATION")
  );
}

/** Montant en euros entiers (ex. 200,00 — typique des aides familiales). */
export function isRoundEuroAmount(amount: number): boolean {
  return Math.round(Math.abs(amount) * 100) % 100 === 0;
}

/**
 * Compare sans les accents : « Anaïs » saisi sans tréma doit reconnaître
 * « From Anaïs L », et réciproquement.
 */
function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function descriptionMatchesAnyKeyword(
  description: string,
  keywords: string[],
): boolean {
  const haystack = plain(description);
  return keywords.some((keyword) => {
    const needle = plain(keyword.trim());
    return needle.length > 0 && haystack.includes(needle);
  });
}

function descriptionHitsExclude(
  description: string,
  excludeKeywords: string[],
): boolean {
  const haystack = plain(description);
  return excludeKeywords.some((keyword) => {
    const needle = plain(keyword.trim());
    return needle.length > 0 && haystack.includes(needle);
  });
}

/** True si le libellé contient une exclusion d'une source de rentrées (ex. ALUTEC). */
export function hitsTrackedIncomeExclude(
  description: string,
  sources: Array<Pick<ProfileTrackedIncomeSource, "excludeKeywords">>,
): boolean {
  const upper = description.toUpperCase();
  return sources.some((source) =>
    descriptionHitsExclude(upper, source.excludeKeywords),
  );
}

/**
 * Rentrée non salariale d'une source configurée (plusieurs libellés possibles).
 * Hors salaire : ne pas confondre avec isPayrollTransfer.
 */
export function isTrackedIncomeTransfer(
  tx: IncomeCandidate,
  source:
    | Pick<
        ProfileTrackedIncomeSource,
        "id" | "keywords" | "excludeKeywords" | "requireRoundAmount"
      >
    | null
    | undefined,
): boolean {
  if (!source || tx.amount <= 0) {
    return false;
  }

  // Un rattachement manuel tranche : ni les mots-clés ni les exclusions.
  if (tx.income_source) {
    return tx.income_source === source.id;
  }

  if (source.keywords.length === 0) {
    return false;
  }

  const description = tx.description.toUpperCase();
  if (isNonIncomeTransferDescription(description)) {
    return false;
  }
  if (descriptionHitsExclude(description, source.excludeKeywords)) {
    return false;
  }
  if (source.requireRoundAmount && !isRoundEuroAmount(tx.amount)) {
    return false;
  }
  if (!descriptionLooksLikeIncomingTransfer(description)) {
    return false;
  }

  return descriptionMatchesAnyKeyword(description, source.keywords);
}

/**
 * @deprecated Prefer isTrackedIncomeTransfer with une source complète.
 * Conservé pour les appels à un seul mot-clé.
 */
export function isTrackedPersonTransfer(
  tx: Pick<TransactionWithAccount, "amount" | "description">,
  keyword: string | null | undefined,
): boolean {
  if (!keyword) {
    return false;
  }
  // Pas d'id : un rattachement manuel relève des sources configurées, pas de
  // cet appel historique à un seul mot-clé.
  return isTrackedIncomeTransfer(tx, {
    id: "",
    keywords: [keyword],
    excludeKeywords: [],
    requireRoundAmount: true,
  });
}

/**
 * Virement émis (débit) dont le libellé contient le mot-clé du destinataire.
 */
export function isTrackedOutgoingTransfer(
  tx: Pick<TransactionWithAccount, "amount" | "description">,
  keyword: string | null | undefined,
): boolean {
  if (!keyword || tx.amount >= 0) {
    return false;
  }

  const description = tx.description.toUpperCase();
  const needle = keyword.trim().toUpperCase();
  if (!needle) {
    return false;
  }

  return (
    description.includes(needle) && descriptionLooksLikeOutgoingTransfer(description)
  );
}

/**
 * Virement de salaire dont le libellé contient le mot-clé employeur configuré.
 * Indépendant des sources d'aide familiale (tracked income).
 */
export function isPayrollTransfer(
  tx: IncomeCandidate,
  keyword: string | null | undefined,
): boolean {
  if (tx.amount <= 0) {
    return false;
  }

  // Un rattachement manuel tranche : ni le mot-clé ni la forme du libellé.
  if (tx.income_source) {
    return tx.income_source === PAYROLL_INCOME_KEY;
  }

  if (!keyword) {
    return false;
  }

  const description = tx.description.toUpperCase();
  const needle = keyword.trim().toUpperCase();
  if (!needle) {
    return false;
  }

  if (isNonIncomeTransferDescription(description)) {
    return false;
  }

  return (
    description.includes(needle) && descriptionLooksLikeIncomingTransfer(description)
  );
}

/** @deprecated Prefer isTrackedIncomeTransfer. */
export function isMotherTransfer(
  tx: Pick<TransactionWithAccount, "amount" | "description">,
  keyword = "PASCAL SOPHIE",
): boolean {
  return isTrackedPersonTransfer(tx, keyword);
}

export function buildMonthlyTransferOverview(
  transactions: TransactionWithAccount[],
  locale: string,
  predicate: (tx: TransactionWithAccount) => boolean,
  options?: { budgetMonthShift?: number; absoluteAmounts?: boolean },
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

  const shiftMonths = options?.budgetMonthShift ?? 0;
  const absoluteAmounts = options?.absoluteAmounts ?? false;
  const buckets = new Map<string, { amount: number; transferCount: number }>();

  for (const tx of matched) {
    const key =
      shiftMonths !== 0 && tx.amount > 0
        ? payrollBudgetMonthKey(tx.booking_date, shiftMonths)
        : tx.booking_date.slice(0, 7);
    const bucket = buckets.get(key) ?? { amount: 0, transferCount: 0 };
    const signed = absoluteAmounts ? Math.abs(tx.amount) : tx.amount;
    bucket.amount += signed;
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
