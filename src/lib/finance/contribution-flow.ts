/**
 * @file contribution-flow.ts
 * @description Agrège les versements vers les enveloppes d'épargne (livrets + PEA)
 * pour suivre « ce que j'épargne » mois par mois.
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import type {
  SavingsAccount,
  TransactionWithAccount,
} from "@/types/database";

export const PEA_ENVELOPE_ID = "pea";
export const PEA_ENVELOPE_COLOR = "#0F766E";

export interface ContributionEnvelope {
  id: string;
  name: string;
  color: string;
  kind: "savings" | "pea";
}

export interface MonthlyContribution {
  monthKey: string;
  month: string;
  monthFull: string;
  deposits: number;
  withdrawals: number;
  /** Versements nets du mois (dépôts − retraits). */
  net: number;
  /** Net par enveloppe, clé = envelope.id. */
  byEnvelope: Record<string, number>;
}

export interface ContributionFlowOverview {
  envelopes: ContributionEnvelope[];
  months: MonthlyContribution[];
  current: MonthlyContribution | null;
  previous: MonthlyContribution | null;
  /** Moyenne des nets mensuels (mois avec activité uniquement). */
  averageNet: number;
  /** Total net sur la période affichée. */
  periodNet: number;
  hasData: boolean;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
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

function emptyMonth(
  monthKey: string,
  locale: string,
  envelopeIds: string[],
): MonthlyContribution {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const byEnvelope: Record<string, number> = {};
  for (const id of envelopeIds) {
    byEnvelope[id] = 0;
  }

  return {
    monthKey,
    month: new Intl.DateTimeFormat(intlLocale, { month: "short" }).format(date),
    monthFull: new Intl.DateTimeFormat(intlLocale, {
      month: "long",
      year: "numeric",
    }).format(date),
    deposits: 0,
    withdrawals: 0,
    net: 0,
    byEnvelope,
  };
}

/** Construit la liste des enveloppes suivies (livrets configurés + PEA). */
export function buildContributionEnvelopes(
  savingsAccounts: SavingsAccount[],
  includePea: boolean,
): ContributionEnvelope[] {
  const envelopes: ContributionEnvelope[] = savingsAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    color: account.color || "#1E3A8A",
    kind: "savings" as const,
  }));

  if (includePea) {
    envelopes.push({
      id: PEA_ENVELOPE_ID,
      name: "PEA",
      color: PEA_ENVELOPE_COLOR,
      kind: "pea",
    });
  }

  return envelopes;
}

/**
 * Agrège les virements internes (livrets + PEA) par mois calendaire.
 * Un dépôt augmente l'épargne, un retrait la diminue.
 */
export function buildContributionFlow(
  transactions: TransactionWithAccount[],
  savingsAccounts: SavingsAccount[],
  locale: string,
  options: { includePea?: boolean } = {},
): ContributionFlowOverview {
  const includePea = options.includePea !== false;
  const envelopes = buildContributionEnvelopes(savingsAccounts, includePea);
  const envelopeIds = envelopes.map((envelope) => envelope.id);
  const envelopeIdSet = new Set(envelopeIds);

  type Bucket = {
    deposits: number;
    withdrawals: number;
    byEnvelope: Record<string, number>;
  };

  const buckets = new Map<string, Bucket>();

  function ensureBucket(monthKey: string): Bucket {
    const existing = buckets.get(monthKey);
    if (existing) return existing;
    const byEnvelope: Record<string, number> = {};
    for (const id of envelopeIds) {
      byEnvelope[id] = 0;
    }
    const created = { deposits: 0, withdrawals: 0, byEnvelope };
    buckets.set(monthKey, created);
    return created;
  }

  for (const tx of transactions) {
    const amount = Math.abs(tx.amount);
    if (amount <= 0) continue;

    let envelopeId: string | null = null;
    let direction: "deposit" | "withdrawal" | null = null;

    if (tx.savings_transfer) {
      envelopeId = tx.savings_transfer.account_id;
      direction = tx.savings_transfer.direction;
    } else if (includePea && tx.pea_transfer) {
      envelopeId = PEA_ENVELOPE_ID;
      direction = tx.pea_transfer.direction;
    }

    if (!envelopeId || !direction || !envelopeIdSet.has(envelopeId)) {
      continue;
    }

    const monthKey = tx.booking_date.slice(0, 7);
    const bucket = ensureBucket(monthKey);

    if (direction === "deposit") {
      bucket.deposits = round(bucket.deposits + amount);
      bucket.byEnvelope[envelopeId] = round(
        (bucket.byEnvelope[envelopeId] ?? 0) + amount,
      );
    } else {
      bucket.withdrawals = round(bucket.withdrawals + amount);
      bucket.byEnvelope[envelopeId] = round(
        (bucket.byEnvelope[envelopeId] ?? 0) - amount,
      );
    }
  }

  const now = new Date();
  const currentKey = monthKeyFromDate(now);
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousKey = monthKeyFromDate(previousDate);

  if (buckets.size === 0) {
    const current = emptyMonth(currentKey, locale, envelopeIds);
    return {
      envelopes,
      months: [current],
      current,
      previous: emptyMonth(previousKey, locale, envelopeIds),
      averageNet: 0,
      periodNet: 0,
      hasData: false,
    };
  }

  const sortedKeys = [...buckets.keys()].sort();
  const earliest = new Date(`${sortedKeys[0]}-01`);
  const monthKeys = enumerateCalendarMonths(earliest, now);

  const months = monthKeys.map((monthKey) => {
    const base = emptyMonth(monthKey, locale, envelopeIds);
    const bucket = buckets.get(monthKey);
    if (!bucket) return base;

    return {
      ...base,
      deposits: bucket.deposits,
      withdrawals: bucket.withdrawals,
      net: round(bucket.deposits - bucket.withdrawals),
      byEnvelope: { ...base.byEnvelope, ...bucket.byEnvelope },
    };
  });

  const current = months.find((row) => row.monthKey === currentKey) ?? null;
  const previous = months.find((row) => row.monthKey === previousKey) ?? null;
  const activeMonths = months.filter(
    (row) => row.deposits > 0 || row.withdrawals > 0,
  );
  const periodNet = round(months.reduce((sum, row) => sum + row.net, 0));
  const averageNet =
    activeMonths.length > 0
      ? round(
          activeMonths.reduce((sum, row) => sum + row.net, 0) /
            activeMonths.length,
        )
      : 0;

  return {
    envelopes,
    months,
    current,
    previous,
    averageNet,
    periodNet,
    hasData: activeMonths.length > 0,
  };
}

export function sliceContributionFlow(
  overview: ContributionFlowOverview,
  period: MonthlyPeriod,
  locale: string,
): ContributionFlowOverview {
  if (period === "all") {
    return overview;
  }

  const envelopeIds = overview.envelopes.map((envelope) => envelope.id);
  const byKey = new Map(overview.months.map((row) => [row.monthKey, row]));
  const now = new Date();
  const months: MonthlyContribution[] = [];

  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthKey = monthKeyFromDate(date);
    months.push(
      byKey.get(monthKey) ?? emptyMonth(monthKey, locale, envelopeIds),
    );
  }

  const currentKey = monthKeyFromDate(now);
  const previousKey = monthKeyFromDate(
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
  );
  const activeMonths = months.filter(
    (row) => row.deposits > 0 || row.withdrawals > 0,
  );

  return {
    ...overview,
    months,
    current: months.find((row) => row.monthKey === currentKey) ?? null,
    previous: months.find((row) => row.monthKey === previousKey) ?? null,
    periodNet: round(months.reduce((sum, row) => sum + row.net, 0)),
    averageNet:
      activeMonths.length > 0
        ? round(
            activeMonths.reduce((sum, row) => sum + row.net, 0) /
              activeMonths.length,
          )
        : 0,
    hasData: activeMonths.length > 0,
  };
}

/** Totaux nets par enveloppe sur une liste de mois. */
export function sumContributionsByEnvelope(
  months: MonthlyContribution[],
  envelopes: ContributionEnvelope[],
): Array<ContributionEnvelope & { net: number }> {
  return envelopes
    .map((envelope) => ({
      ...envelope,
      net: round(
        months.reduce(
          (sum, month) => sum + (month.byEnvelope[envelope.id] ?? 0),
          0,
        ),
      ),
    }))
    .filter((envelope) => envelope.net !== 0)
    .sort((a, b) => b.net - a.net);
}
