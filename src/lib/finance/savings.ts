/**
 * @file savings.ts
 * @description Suivi des comptes d'épargne (livret interne, PEL) à partir des
 * mouvements bancaires. Le solde affiché est ancré sur le solde actuel connu ;
 * l'historique est reconstruit en remontant les mouvements.
 */

import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  isInternalTransfer,
  isParentPelFunding,
  isPelDeposit,
} from "@/lib/finance/tracked-transfers";
import type { TransactionWithAccount } from "@/types/database";

export type SavingsVehicleKey = "livret" | "pel";

/**
 * Soldes actuels connus (à mettre à jour si besoin). Servent d'ancrage : le
 * dernier point de l'historique correspond toujours à ce solde.
 */
export const SAVINGS_BASE_BALANCES: Record<SavingsVehicleKey, number> = {
  livret: 10,
  pel: 7504.5,
};

export const SAVINGS_VEHICLE_COLORS: Record<SavingsVehicleKey, string> = {
  livret: "#1E3A8A",
  pel: "#CA8A04",
};

/**
 * Caractéristiques réelles du PEL (issues de la banque). À mettre à jour si
 * le contrat évolue. Sert à afficher des chiffres exacts (intérêts, versement
 * mensuel, plafond…) que les transactions seules ne permettent pas de déduire.
 */
export interface PelMeta {
  /** Solde total, intérêts compris. */
  balanceWithInterest: number;
  /** Capital versé, hors intérêts. */
  principal: number;
  /** Intérêts acquis. */
  interest: number;
  /** Taux d'intérêt annuel (ex. 0.01 pour 1 %). */
  rate: number;
  /** Versement programmé mensuel. */
  monthlyDeposit: number;
  /** Plafond légal de versements. */
  ceiling: number;
  /** Montant restant à verser pour respecter le contrat. */
  remainingToDeposit: number;
  /** Date limite pour le restant à verser (ISO). */
  remainingDeadline: string;
  /** Date d'ouverture du plan (ISO). */
  openingDate: string;
}

export const PEL_META: PelMeta = {
  balanceWithInterest: 7504.5,
  principal: 7340,
  interest: 234.91,
  rate: 0.01,
  monthlyDeposit: 45,
  ceiling: 61200,
  remainingToDeposit: 360,
  remainingDeadline: "2027-02-22",
  openingDate: "2022-02-22",
};

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
  key: SavingsVehicleKey;
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  movementCount: number;
  funding: number;
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

/** Mouvement d'épargne signé : positif = versement, négatif = retrait. */
function classifyMovement(
  tx: TransactionWithAccount,
): { vehicle: SavingsVehicleKey; amount: number } | null {
  if (isInternalTransfer(tx)) {
    return {
      vehicle: "livret",
      amount: tx.amount < 0 ? Math.abs(tx.amount) : -Math.abs(tx.amount),
    };
  }

  if (isPelDeposit(tx)) {
    return { vehicle: "pel", amount: Math.abs(tx.amount) };
  }

  return null;
}

function buildVehicle(
  key: SavingsVehicleKey,
  transactions: TransactionWithAccount[],
  monthFormatter: Intl.DateTimeFormat,
  monthFullFormatter: Intl.DateTimeFormat,
  now: Date,
): SavingsVehicle {
  const movements: SavingsMovementItem[] = [];
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let funding = 0;

  for (const tx of transactions) {
    if (key === "pel" && isParentPelFunding(tx)) {
      funding += Math.abs(tx.amount);
    }

    const movement = classifyMovement(tx);
    if (!movement || movement.vehicle !== key) {
      continue;
    }

    movements.push({
      id: tx.id,
      date: tx.booking_date,
      monthKey: tx.booking_date.slice(0, 7),
      label: tx.description,
      amount: movement.amount,
    });

    if (movement.amount >= 0) {
      totalDeposits += movement.amount;
    } else {
      totalWithdrawals += Math.abs(movement.amount);
    }
  }

  const balance = SAVINGS_BASE_BALANCES[key];

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

  const monthKeysWithData = [...netByMonth.keys()].sort();
  const earliest = monthKeysWithData.length
    ? new Date(`${monthKeysWithData[0]}-01`)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKeys = enumerateCalendarMonths(earliest, now);

  const totalNet = totalDeposits - totalWithdrawals;
  let running = round(balance - totalNet);

  const monthly: SavingsMonthPoint[] = monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    const bucket = netByMonth.get(monthKey) ?? { deposits: 0, withdrawals: 0 };
    const net = round(bucket.deposits - bucket.withdrawals);
    running = round(running + net);

    return {
      monthKey,
      month: monthFormatter.format(date),
      monthFull: monthFullFormatter.format(date),
      deposits: round(bucket.deposits),
      withdrawals: round(bucket.withdrawals),
      net,
      balance: running,
    };
  });

  movements.sort((a, b) => b.date.localeCompare(a.date));

  return {
    key,
    balance: round(balance),
    totalDeposits: round(totalDeposits),
    totalWithdrawals: round(totalWithdrawals),
    movementCount: movements.length,
    funding: round(funding),
    monthly,
    movements,
  };
}

export function buildSavingsOverview(
  transactions: TransactionWithAccount[],
  locale: string,
): SavingsOverview {
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
  const monthFullFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });
  const now = new Date();

  const vehicles = (
    Object.keys(SAVINGS_BASE_BALANCES) as SavingsVehicleKey[]
  ).map((key) =>
    buildVehicle(key, transactions, monthFormatter, monthFullFormatter, now),
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
