/**
 * @file queries.ts
 * @description Lecture des comptes et transactions (Supabase ou mode démo).
 */

import { getAppUser, type AppUser } from "@/lib/auth";
import { buildMonthlySpending } from "@/lib/finance/aggregates";
import {
  dedupeCategories,
  mapCategory,
  syncDefaultCategories,
} from "@/lib/finance/expense-categories";
import {
  mapRecurringPayment,
  resolveCanonicalRules,
} from "@/lib/finance/recurring-payments";
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

/**
 * Sections que la page appelante consomme réellement.
 *
 * Trois tables ne sont lues que par une ou deux pages. Les demander partout
 * coûtait un aller-retour Postgres (et une évaluation de policy RLS) par page,
 * pour des données jetées aussitôt. Tout est activé par défaut : une page qui
 * ne précise rien garde le comportement complet.
 *
 * Les autres tables restent inconditionnelles car les transactions en dépendent
 * pour être annotées (nom de catégorie, nom d'abonnement, virement d'épargne) et
 * ces annotations sont lues par toutes les pages.
 */
export interface FinanceDataSections {
  /** Ajustements manuels d'épargne — page épargne uniquement. */
  savingsAdjustments?: boolean;
  /** Suggestions d'abonnements écartées — page réglages uniquement. */
  dismissedSuggestions?: boolean;
  /** Consentement bancaire — pages épargne et réglages. */
  bankConnection?: boolean;
}

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

/**
 * Colonnes réellement consommées par l'interface.
 *
 * `raw_json` est volontairement exclue : cette colonne stocke la charge utile
 * brute renvoyée par la banque pour chaque transaction et n'est lue que par
 * `remapStoredTransactions()`. La ramener ici multipliait le poids de la
 * réponse sans qu'aucun composant ne l'utilise.
 */
const TRANSACTION_COLUMNS = [
  "id",
  "account_id",
  "entry_reference",
  "booking_date",
  "amount",
  "currency",
  "description",
  "status",
  "category_id",
  "category_manual",
  "recurring_payment_id",
  "recurring_payment_manual",
  "note",
  "savings_account_id",
  "savings_account_manual",
  "created_at",
  "updated_at",
].join(", ");

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
    last_transactions_synced_at: row.last_transactions_synced_at
      ? String(row.last_transactions_synced_at)
      : null,
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

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

type PostgrestResult = PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Normalise le résultat d'une requête PostgREST en lignes brutes.
 *
 * `query` peut valoir `null` quand la page appelante n'a pas demandé la
 * section : on renvoie alors un résultat vide sans toucher au réseau, ce qui
 * évite d'éparpiller des ternaires dans le `Promise.all`.
 */
async function readRows(
  query: PostgrestResult | null,
): Promise<{ rows: Record<string, unknown>[]; error: unknown }> {
  if (!query) {
    return { rows: [], error: null };
  }

  const { data, error } = await query;
  return { rows: (data ?? []) as Record<string, unknown>[], error };
}

async function readRow(
  query: PostgrestResult | null,
): Promise<{ row: Record<string, unknown> | null; error: unknown }> {
  if (!query) {
    return { row: null, error: null };
  }

  const { data, error } = await query;
  return { row: (data ?? null) as Record<string, unknown> | null, error };
}

/**
 * Lit les transactions des comptes fournis en ne demandant que les colonnes
 * utilisées par l'interface.
 *
 * Si une colonne n'existe pas encore (migration non appliquée), PostgREST
 * rejette toute la requête : on retombe alors sur `*` pour conserver la
 * dégradation progressive dont dépendent les indicateurs `*SchemaReady`.
 */
async function fetchTransactionRows(
  supabase: SupabaseServerClient,
  accountIds: string[],
): Promise<{ rows: Record<string, unknown>[]; error: unknown }> {
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .in("account_id", accountIds)
    .order("booking_date", { ascending: false });

  if (!error) {
    return {
      rows: (data ?? []) as unknown as Record<string, unknown>[],
      error: null,
    };
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from("transactions")
    .select("*")
    .in("account_id", accountIds)
    .order("booking_date", { ascending: false });

  return {
    rows: (fallback ?? []) as Record<string, unknown>[],
    error: fallbackError,
  };
}

/**
 * Lit les catégories de l'utilisateur.
 *
 * Les catégories par défaut ne sont semées que pour un utilisateur qui n'en a
 * aucune. Le reste de la maintenance (fusion et nettoyage des mots-clés) reste
 * déclenché par les server actions de `app/actions/categories.ts`, pour qu'un
 * simple affichage de page n'écrive jamais en base.
 */
async function fetchCategories(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ categories: Category[]; schemaReady: boolean }> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    return { categories: [], schemaReady: false };
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    try {
      const { categories } = await syncDefaultCategories(supabase, userId);
      return { categories: dedupeCategories(categories), schemaReady: true };
    } catch {
      return { categories: [], schemaReady: false };
    }
  }

  return {
    categories: dedupeCategories(
      rows.map((row) => mapCategory(row as Record<string, unknown>)),
    ),
    schemaReady: true,
  };
}

async function fetchFromSupabase(
  user: AppUser,
  locale: string,
  sections: FinanceDataSections,
): Promise<FinanceData> {
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
    { rows: accountRows },
    { row: connectionRow },
    { rows: recurringRows, error: recurringError },
    { rows: dismissalRows, error: dismissalError },
    { rows: savingsRows, error: savingsError },
    { rows: adjustmentRows, error: adjustmentError },
  ] = await Promise.all([
    readRows(supabase.from("accounts").select("*").order("name")),
    readRow(
      sections.bankConnection === false
        ? null
        : supabase
            .from("bank_connections")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ),
    readRows(
      supabase
        .from("recurring_payments")
        .select("*")
        .eq("user_id", user.id)
        .order("name"),
    ),
    readRows(
      sections.dismissedSuggestions === false
        ? null
        : supabase
            .from("recurring_suggestion_dismissals")
            .select("cluster_key")
            .eq("user_id", user.id),
    ),
    readRows(
      supabase
        .from("savings_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at"),
    ),
    readRows(
      sections.savingsAdjustments === false
        ? null
        : supabase
            .from("savings_adjustments")
            .select("*")
            .eq("user_id", user.id)
            .order("adjustment_date", { ascending: false }),
    ),
  ]);

  const accounts = accountRows.map((row) => mapAccount(row));

  // Second étage : transactions et catégories ne dépendent que des comptes,
  // donc ils partent ensemble au lieu de s'enchaîner.
  const accountIds = accounts.map((account) => account.id);
  const [transactionResult, categoryResult] = await Promise.all([
    accountIds.length > 0
      ? fetchTransactionRows(supabase, accountIds)
      : Promise.resolve({ rows: [], error: null }),
    fetchCategories(supabase, user.id),
  ]);

  const savingsSchemaReady = !savingsError && !adjustmentError;
  const savingsAccounts = savingsRows.map((row) => mapSavingsAccount(row));
  const savingsAdjustments = adjustmentRows.map((row) =>
    mapSavingsAdjustment(row),
  );

  const recurringPayments = recurringRows.map((row) =>
    mapRecurringPayment(row),
  );

  // Nom canonique : une transaction rattachée à une règle fusionnée affiche le
  // nom du service, pas celui de la variante de libellé.
  const canonicalRuleById = resolveCanonicalRules(recurringPayments);
  const recurringNameById = new Map(
    recurringPayments.map((payment) => [
      payment.id,
      canonicalRuleById.get(payment.id)?.name ?? payment.name,
    ]),
  );

  const { categories, schemaReady: categoriesSchemaReady } = categoryResult;

  const categoryById = new Map(
    categories.map((category) => [
      category.id,
      { name: category.name, color: category.color },
    ]),
  );

  const accountById = new Map(accounts.map((account) => [account.id, account]));

  let transactions: TransactionWithAccount[] = transactionResult.rows.flatMap(
    (row) => {
      const account = accountById.get(String(row.account_id));
      if (!account) {
        return [];
      }

      const recurringPaymentId = row.recurring_payment_id
        ? String(row.recurring_payment_id)
        : null;
      const categoryId = row.category_id ? String(row.category_id) : null;

      return [
        mapTransaction(
          row,
          account,
          recurringPaymentId
            ? (recurringNameById.get(recurringPaymentId) ?? null)
            : null,
          categoryId ? (categoryById.get(categoryId) ?? null) : null,
        ),
      ];
    },
  );

  transactions = annotateSavingsTransfers(transactions, savingsAccounts);

  return {
    accounts,
    transactions,
    categories,
    recurringPayments,
    savingsAccounts,
    savingsAdjustments,
    dismissedSuggestionKeys: dismissalRows.map((row) =>
      String(row.cluster_key),
    ),
    subscriptionsSchemaReady: !recurringError && !dismissalError,
    categoriesSchemaReady,
    savingsSchemaReady,
    monthlySpending: buildMonthlySpending(transactions, locale),
    bankConnection: connectionRow ? mapBankConnection(connectionRow) : null,
    isDemo: false,
  };
}

/**
 * Charge les données financières de l'utilisateur courant.
 * Mode démo : données fictives si Supabase n'est pas configuré.
 *
 * `sections` permet à une page de ne pas payer les lectures qu'elle n'affiche
 * pas (voir `FinanceDataSections`). Les champs correspondants sont alors vides.
 */
export async function getFinanceData(
  locale = "fr",
  sections: FinanceDataSections = {},
): Promise<FinanceData> {
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

  return fetchFromSupabase(user, locale, sections);
}
