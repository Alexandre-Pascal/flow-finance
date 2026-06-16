/**
 * @file savings.ts
 * @description Suivi des comptes d'épargne définis par l'utilisateur. Chaque
 * compte porte un solde de base (à une date donnée) et des libellés de virement
 * vers/depuis le compte courant. Les soldes et historiques sont reconstruits à
 * partir des transactions correspondantes.
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import type {
  SavingsAccount,
  SavingsAccountKind,
  SavingsTransferRef,
  TransactionWithAccount,
} from "@/types/database";

export const SAVINGS_KINDS: SavingsAccountKind[] = [
  "livret_a",
  "ldd",
  "lep",
  "livret_jeune",
  "pel",
  "cel",
  "other",
];

/** Couleur par défaut suggérée selon le type de support. */
export const SAVINGS_KIND_COLORS: Record<SavingsAccountKind, string> = {
  livret_a: "#CA8A04",
  ldd: "#15803D",
  lep: "#0E7490",
  livret_jeune: "#1E3A8A",
  pel: "#B45309",
  cel: "#7C3AED",
  other: "#475569",
};

export function mapSavingsAccount(row: Record<string, unknown>): SavingsAccount {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    kind: (row.kind as SavingsAccountKind) ?? "other",
    color: String(row.color ?? "#1E3A8A"),
    base_balance: Number(row.base_balance ?? 0),
    base_date: String(row.base_date ?? new Date().toISOString().slice(0, 10)),
    interest_rate: row.interest_rate == null ? null : Number(row.interest_rate),
    ceiling: row.ceiling == null ? null : Number(row.ceiling),
    opening_date: row.opening_date ? String(row.opening_date) : null,
    deposit_keywords: Array.isArray(row.deposit_keywords)
      ? (row.deposit_keywords as unknown[]).map(String)
      : [],
    withdrawal_keywords: Array.isArray(row.withdrawal_keywords)
      ? (row.withdrawal_keywords as unknown[]).map(String)
      : [],
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * Détermine si une transaction est un virement vers/depuis un compte d'épargne
 * de l'utilisateur, en comparant son libellé aux mots-clés configurés.
 */
export function matchSavingsTransfer(
  tx: Pick<TransactionWithAccount, "description">,
  savingsAccounts: SavingsAccount[],
): { account: SavingsAccount; direction: "deposit" | "withdrawal" } | null {
  const description = tx.description.toUpperCase();

  for (const account of savingsAccounts) {
    for (const keyword of account.deposit_keywords) {
      const needle = keyword.trim().toUpperCase();
      if (needle.length >= 2 && description.includes(needle)) {
        return { account, direction: "deposit" };
      }
    }
    for (const keyword of account.withdrawal_keywords) {
      const needle = keyword.trim().toUpperCase();
      if (needle.length >= 2 && description.includes(needle)) {
        return { account, direction: "withdrawal" };
      }
    }
  }

  return null;
}

/** Annote chaque transaction avec son éventuel mouvement d'épargne. */
export function annotateSavingsTransfers(
  transactions: TransactionWithAccount[],
  savingsAccounts: SavingsAccount[],
): TransactionWithAccount[] {
  if (savingsAccounts.length === 0) {
    return transactions;
  }

  const accountById = new Map(savingsAccounts.map((a) => [a.id, a]));

  return transactions.map((tx) => {
    let savings_transfer: SavingsTransferRef | null = null;

    if (tx.savings_account_manual && tx.savings_account_id) {
      // Affectation manuelle : prime sur les mots-clés. La direction est
      // déduite du signe (sortie du compte courant = versement sur le livret).
      const account = accountById.get(tx.savings_account_id);
      if (account) {
        savings_transfer = {
          account_id: account.id,
          account_name: account.name,
          direction: tx.amount < 0 ? "deposit" : "withdrawal",
        };
      }
    } else {
      const match = matchSavingsTransfer(tx, savingsAccounts);
      if (match) {
        savings_transfer = {
          account_id: match.account.id,
          account_name: match.account.name,
          direction: match.direction,
        };
      }
    }

    return { ...tx, savings_transfer };
  });
}

export function isSavingsTransfer(
  tx: Pick<TransactionWithAccount, "savings_transfer">,
): boolean {
  return tx.savings_transfer != null;
}

export interface SavingsMonthPoint {
  monthKey: string;
  month: string;
  monthFull: string;
  deposits: number;
  withdrawals: number;
  net: number;
  balance: number;
}

export interface SavingsMovementItem {
  id: string;
  date: string;
  monthKey: string;
  label: string;
  amount: number;
}

export interface SavingsVehicle {
  account: SavingsAccount;
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  movementCount: number;
  monthly: SavingsMonthPoint[];
  movements: SavingsMovementItem[];
}

export interface SavingsOverview {
  vehicles: SavingsVehicle[];
  totalBalance: number;
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

function buildVehicle(
  account: SavingsAccount,
  transactions: TransactionWithAccount[],
  monthFormatter: Intl.DateTimeFormat,
  monthFullFormatter: Intl.DateTimeFormat,
  now: Date,
): SavingsVehicle {
  const movements: SavingsMovementItem[] = [];
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  // On prend en compte TOUS les virements identifiés pour ce compte, quelle que
  // soit leur date : le solde saisi par l'utilisateur est le solde *actuel*, on
  // reconstruit donc l'historique en remontant le temps à partir de ce solde.
  for (const tx of transactions) {
    const ref = tx.savings_transfer;
    if (!ref || ref.account_id !== account.id) {
      continue;
    }

    const signed =
      ref.direction === "deposit"
        ? Math.abs(tx.amount)
        : -Math.abs(tx.amount);

    movements.push({
      id: tx.id,
      date: tx.booking_date,
      monthKey: tx.booking_date.slice(0, 7),
      label: tx.description,
      amount: signed,
    });

    if (signed >= 0) {
      totalDeposits += signed;
    } else {
      totalWithdrawals += Math.abs(signed);
    }
  }

  const netByMonth = new Map<string, { deposits: number; withdrawals: number }>();
  for (const movement of movements) {
    const bucket = netByMonth.get(movement.monthKey) ?? {
      deposits: 0,
      withdrawals: 0,
    };
    if (movement.amount >= 0) {
      bucket.deposits += movement.amount;
    } else {
      bucket.withdrawals += Math.abs(movement.amount);
    }
    netByMonth.set(movement.monthKey, bucket);
  }

  // Bornes de la courbe : du plus ancien mouvement (ou mois du solde de base)
  // jusqu'à aujourd'hui.
  const baseDate = new Date(`${account.base_date}T00:00:00`);
  const baseMonthKey = account.base_date.slice(0, 7);
  const movementMonthKeys = movements.map((m) => m.monthKey);
  const earliestKey = [baseMonthKey, ...movementMonthKeys].sort()[0];
  const startDate = new Date(`${earliestKey}-01T00:00:00`);
  const fromDate = startDate < baseDate ? startDate : baseDate;
  const monthKeys = enumerateCalendarMonths(fromDate, now);

  // On ancre le solde de base sur son mois, puis on propage : vers l'avant en
  // ajoutant les mouvements, vers l'arrière en les retranchant.
  const baseIndex = Math.max(
    0,
    monthKeys.findIndex((key) => key >= baseMonthKey),
  );

  const months = monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const bucket = netByMonth.get(monthKey) ?? { deposits: 0, withdrawals: 0 };
    const net = round(bucket.deposits - bucket.withdrawals);
    return {
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      deposits: round(bucket.deposits),
      withdrawals: round(bucket.withdrawals),
      net,
      balance: 0,
    };
  });

  const balances = new Array<number>(months.length).fill(0);
  balances[baseIndex] = round(account.base_balance);
  for (let i = baseIndex + 1; i < months.length; i += 1) {
    balances[i] = round(balances[i - 1] + months[i].net);
  }
  for (let i = baseIndex - 1; i >= 0; i -= 1) {
    balances[i] = round(balances[i + 1] - months[i + 1].net);
  }

  const monthly: SavingsMonthPoint[] = months.map((point, index) => ({
    ...point,
    balance: balances[index],
  }));

  const balance = monthly.length > 0 ? monthly[monthly.length - 1].balance : round(account.base_balance);

  movements.sort((a, b) => b.date.localeCompare(a.date));

  return {
    account,
    balance,
    totalDeposits: round(totalDeposits),
    totalWithdrawals: round(totalWithdrawals),
    movementCount: movements.length,
    monthly,
    movements,
  };
}

export function buildSavingsOverview(
  transactions: TransactionWithAccount[],
  savingsAccounts: SavingsAccount[],
  locale: string,
): SavingsOverview {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });
  const now = new Date();

  const vehicles = savingsAccounts.map((account) =>
    buildVehicle(account, transactions, monthFormatter, monthFullFormatter, now),
  );

  return {
    vehicles,
    totalBalance: round(
      vehicles.reduce((sum, vehicle) => sum + vehicle.balance, 0),
    ),
  };
}

export function sliceSavingsMonths(
  monthly: SavingsMonthPoint[],
  period: MonthlyPeriod,
): SavingsMonthPoint[] {
  if (period === "all") {
    return monthly;
  }
  return monthly.slice(-period);
}
