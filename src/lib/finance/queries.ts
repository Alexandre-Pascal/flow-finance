/**
 * @file queries.ts
 * @description Lecture des comptes et transactions (Supabase ou mode démo).
 */

import { getAppUser, type AppUser } from "@/lib/auth";
import { mapRecurringPayment } from "@/lib/finance/recurring-payments";
import {
  MOCK_ACCOUNTS,
  MOCK_MONTHLY_SPENDING,
  MOCK_TRANSACTIONS,
} from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  BankConnection,
  RecurringPayment,
  TransactionWithAccount,
} from "@/types/database";

export interface FinanceData {
  accounts: Account[];
  transactions: TransactionWithAccount[];
  recurringPayments: RecurringPayment[];
  monthlySpending: { month: string; amount: number }[];
  bankConnection: BankConnection | null;
  isDemo: boolean;
}

function mapAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    connection_id: row.connection_id ? String(row.connection_id) : null,
    external_uid: row.external_uid ? String(row.external_uid) : null,
    name: String(row.name),
    iban: row.iban ? String(row.iban) : null,
    type: row.type as Account["type"],
    balance: Number(row.balance),
    currency: String(row.currency),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapTransaction(
  row: Record<string, unknown>,
  account: Account,
  recurringPaymentName?: string | null,
): TransactionWithAccount {
  return {
    id: String(row.id),
    account_id: String(row.account_id),
    entry_reference: String(row.entry_reference),
    booking_date: String(row.booking_date),
    amount: Number(row.amount),
    currency: String(row.currency),
    description: String(row.description),
    status: row.status as TransactionWithAccount["status"],
    category_id: row.category_id ? String(row.category_id) : null,
    recurring_payment_id: row.recurring_payment_id
      ? String(row.recurring_payment_id)
      : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    account_name: account.name,
    account_type: account.type,
    recurring_payment_name: recurringPaymentName ?? null,
  };
}

function mapBankConnection(row: Record<string, unknown>): BankConnection {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    provider: String(row.provider),
    session_id: row.session_id ? String(row.session_id) : null,
    aspsp_name: row.aspsp_name ? String(row.aspsp_name) : null,
    valid_until: row.valid_until ? String(row.valid_until) : null,
    status: row.status as BankConnection["status"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function fetchFromSupabase(user: AppUser): Promise<FinanceData> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      accounts: [],
      transactions: [],
      recurringPayments: [],
      monthlySpending: [],
      bankConnection: null,
      isDemo: false,
    };
  }

  const [
    { data: accountRows },
    { data: connectionRow },
    { data: recurringRows },
  ] = await Promise.all([
    supabase.from("accounts").select("*").order("name"),
    supabase
      .from("bank_connections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("recurring_payments")
      .select("*")
      .eq("user_id", user.id)
      .order("name"),
  ]);

  const accounts = (accountRows ?? []).map((row) =>
    mapAccount(row as Record<string, unknown>),
  );

  const recurringPayments = (recurringRows ?? []).map((row) =>
    mapRecurringPayment(row as Record<string, unknown>),
  );

  const recurringNameById = new Map(
    recurringPayments.map((payment: { id: string; name: string }) => [
      payment.id,
      payment.name,
    ]),
  );

  let transactions: TransactionWithAccount[] = [];

  if (accounts.length > 0) {
    const accountIds = accounts.map((account) => account.id);
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const { data: transactionRows } = await supabase
      .from("transactions")
      .select("*")
      .in("account_id", accountIds)
      .order("booking_date", { ascending: false });

    transactions = (transactionRows ?? []).map((row) => {
      const account = accountById.get(String(row.account_id));
      if (!account) {
        throw new Error("Transaction references unknown account.");
      }

      const recurringPaymentId = row.recurring_payment_id
        ? String(row.recurring_payment_id)
        : null;

      return mapTransaction(
        row as Record<string, unknown>,
        account,
        recurringPaymentId
          ? recurringNameById.get(recurringPaymentId) ?? null
          : null,
      );
    });
  }

  const { buildMonthlySpending } = await import("@/lib/finance/aggregates");

  return {
    accounts,
    transactions,
    recurringPayments,
    monthlySpending: buildMonthlySpending(transactions, "fr"),
    bankConnection: connectionRow
      ? mapBankConnection(connectionRow as Record<string, unknown>)
      : null,
    isDemo: false,
  };
}

/**
 * Charge les données financières de l'utilisateur courant.
 * Mode démo : données fictives si Supabase n'est pas configuré.
 */
export async function getFinanceData(locale = "fr"): Promise<FinanceData> {
  const user = await getAppUser();

  if (!user) {
    return {
      accounts: [],
      transactions: [],
      recurringPayments: [],
      monthlySpending: [],
      bankConnection: null,
      isDemo: false,
    };
  }

  if (user.isDemo) {
    return {
      accounts: MOCK_ACCOUNTS,
      transactions: MOCK_TRANSACTIONS,
      recurringPayments: [],
      monthlySpending: MOCK_MONTHLY_SPENDING,
      bankConnection: null,
      isDemo: true,
    };
  }

  const data = await fetchFromSupabase(user);
  const { buildMonthlySpending } = await import("@/lib/finance/aggregates");

  return {
    ...data,
    monthlySpending: buildMonthlySpending(data.transactions, locale),
  };
}
