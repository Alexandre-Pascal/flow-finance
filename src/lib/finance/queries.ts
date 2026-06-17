/**
 * @file queries.ts
 * @description Lecture des comptes et transactions (Supabase ou mode démo).
 */

import { getAppUser, type AppUser } from "@/lib/auth";
import {
  dedupeCategories,
  mapCategory,
  syncDefaultCategories,
} from "@/lib/finance/expense-categories";
import { mapRecurringPayment } from "@/lib/finance/recurring-payments";
import { rematchCategoriesForUser } from "@/lib/finance/rematch-categories";
import { rematchRecurringPaymentsForUser } from "@/lib/finance/rematch-recurring-payments";
import {
  annotateSavingsTransfers,
  mapSavingsAccount,
  mapSavingsAdjustment,
} from "@/lib/finance/savings";
import {
  MOCK_ACCOUNTS,
  MOCK_CATEGORIES,
  MOCK_MONTHLY_SPENDING,
  MOCK_TRANSACTIONS,
} from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  BankConnection,
  Category,
  RecurringPayment,
  SavingsAccount,
  SavingsAdjustment,
  TransactionWithAccount,
} from "@/types/database";

export interface FinanceData {
  accounts: Account[];
  transactions: TransactionWithAccount[];
  categories: Category[];
  recurringPayments: RecurringPayment[];
  savingsAccounts: SavingsAccount[];
  savingsAdjustments: SavingsAdjustment[];
  dismissedSuggestionKeys: string[];
  subscriptionsSchemaReady: boolean;
  categoriesSchemaReady: boolean;
  savingsSchemaReady: boolean;
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
  category?: { name: string; color: string } | null,
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
    category_manual: Boolean(row.category_manual),
    recurring_payment_id: row.recurring_payment_id
      ? String(row.recurring_payment_id)
      : null,
    recurring_payment_manual: Boolean(row.recurring_payment_manual),
    note: row.note ? String(row.note) : null,
    savings_account_id: row.savings_account_id
      ? String(row.savings_account_id)
      : null,
    savings_account_manual: Boolean(row.savings_account_manual),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    account_name: account.name,
    account_type: account.type,
    recurring_payment_name: recurringPaymentName ?? null,
    category_name: category?.name ?? null,
    category_color: category?.color ?? null,
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
      categories: [],
      recurringPayments: [],
      savingsAccounts: [],
      savingsAdjustments: [],
      dismissedSuggestionKeys: [],
      subscriptionsSchemaReady: false,
      categoriesSchemaReady: false,
      savingsSchemaReady: false,
      monthlySpending: [],
      bankConnection: null,
      isDemo: false,
    };
  }

  const [
    { data: accountRows },
    { data: connectionRow },
    { data: recurringRows, error: recurringError },
    { data: dismissalRows, error: dismissalError },
    { data: savingsRows, error: savingsError },
    { data: adjustmentRows, error: adjustmentError },
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
    supabase
      .from("recurring_suggestion_dismissals")
      .select("cluster_key")
      .eq("user_id", user.id),
    supabase
      .from("savings_accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("savings_adjustments")
      .select("*")
      .eq("user_id", user.id)
      .order("adjustment_date", { ascending: false }),
  ]);

  const accounts = (accountRows ?? []).map((row) =>
    mapAccount(row as Record<string, unknown>),
  );

  const savingsSchemaReady = !savingsError && !adjustmentError;
  const savingsAccounts = (savingsRows ?? []).map((row) =>
    mapSavingsAccount(row as Record<string, unknown>),
  );
  const savingsAdjustments = (adjustmentRows ?? []).map((row) =>
    mapSavingsAdjustment(row as Record<string, unknown>),
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

  let categories: Category[] = [];
  let categoriesSchemaReady = true;
  let needsFullRematch = false;

  try {
    const { categories: loadedCategories, changed } =
      await syncDefaultCategories(supabase, user.id);
    categories = dedupeCategories(loadedCategories);
    needsFullRematch = changed;
  } catch {
    categoriesSchemaReady = false;
    const { data: categoryRows } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", user.id);

    categories = dedupeCategories(
      (categoryRows ?? []).map((row) =>
        mapCategory(row as Record<string, unknown>),
      ),
    );
  }

  if (categories.length > 0) {
    try {
      await rematchCategoriesForUser(user.id, supabase, {
        onlyUncategorized: !needsFullRematch,
      });
    } catch {
      categoriesSchemaReady = false;
    }
  }

  if (recurringPayments.length > 0) {
    try {
      await rematchRecurringPaymentsForUser(user.id, supabase);
    } catch {
      // Le rattachement des abonnements est best-effort au chargement.
    }
  }

  const categoryById = new Map(
    categories.map((category) => [
      category.id,
      { name: category.name, color: category.color },
    ]),
  );

  let transactions: TransactionWithAccount[] = [];

  if (accounts.length > 0) {
    const accountIds = accounts.map((account) => account.id);
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );

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
      const categoryId = row.category_id ? String(row.category_id) : null;

      return mapTransaction(
        row as Record<string, unknown>,
        account,
        recurringPaymentId
          ? (recurringNameById.get(recurringPaymentId) ?? null)
          : null,
        categoryId ? (categoryById.get(categoryId) ?? null) : null,
      );
    });
  }

  transactions = annotateSavingsTransfers(transactions, savingsAccounts);

  const { buildMonthlySpending } = await import("@/lib/finance/aggregates");

  return {
    accounts,
    transactions,
    categories,
    recurringPayments,
    savingsAccounts,
    savingsAdjustments,
    dismissedSuggestionKeys: (dismissalRows ?? []).map((row) =>
      String(row.cluster_key),
    ),
    subscriptionsSchemaReady: !recurringError && !dismissalError,
    categoriesSchemaReady,
    savingsSchemaReady,
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
      categories: [],
      recurringPayments: [],
      savingsAccounts: [],
      savingsAdjustments: [],
      dismissedSuggestionKeys: [],
      subscriptionsSchemaReady: false,
      categoriesSchemaReady: false,
      savingsSchemaReady: false,
      monthlySpending: [],
      bankConnection: null,
      isDemo: false,
    };
  }

  if (user.isDemo) {
    return {
      accounts: MOCK_ACCOUNTS,
      transactions: MOCK_TRANSACTIONS,
      categories: MOCK_CATEGORIES,
      recurringPayments: [],
      savingsAccounts: [],
      savingsAdjustments: [],
      monthlySpending: MOCK_MONTHLY_SPENDING,
      dismissedSuggestionKeys: [],
      bankConnection: null,
      isDemo: true,
      subscriptionsSchemaReady: true,
      categoriesSchemaReady: true,
      savingsSchemaReady: true,
    };
  }

  const data = await fetchFromSupabase(user);
  const { buildMonthlySpending } = await import("@/lib/finance/aggregates");

  return {
    ...data,
    monthlySpending: buildMonthlySpending(data.transactions, locale),
  };
}
