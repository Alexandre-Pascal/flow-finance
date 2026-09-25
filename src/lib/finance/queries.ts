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
  annotateAccountTransfers,
  withManualBalances,
} from "@/lib/finance/account-transfers";
import { defaultSpace } from "@/lib/finance/spaces";
import { mapSpace } from "@/lib/finance/spaces";
import { getActiveSpace } from "@/lib/get-active-space";
import {
  annotateSavingsTransfers,
  mapSavingsAccount,
  mapSavingsAdjustment,
} from "@/lib/finance/savings";
import {
  annotatePeaTransfers,
  mapPeaInvestmentPlan,
} from "@/lib/pea/transfers";
import { mapPeaHolding } from "@/lib/pea/valuation";
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
  PeaInvestmentPlan,
  RecurringPayment,
  SavingsAccount,
  SavingsAdjustment,
  Space,
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
  /** Plans d'investissement PEA (mots-clés → ligne cible). */
  peaInvestmentPlans: PeaInvestmentPlan[];
  dismissedSuggestionKeys: string[];
  subscriptionsSchemaReady: boolean;
  categoriesSchemaReady: boolean;
  savingsSchemaReady: boolean;
  monthlySpending: { month: string; amount: number }[];
  /** Connexion la plus récente — celle qu'on affiche par défaut. */
  bankConnection: BankConnection | null;
  /** Toutes les banques reliées, de la plus récente à la plus ancienne. */
  bankConnections: BankConnection[];
  /** Espaces de l'utilisateur, du plus prioritaire au moins prioritaire. */
  spaces: Space[];
  /** Espace sur lequel les données sont filtrées. */
  activeSpace: Space | null;
  /** Comptes de tous les espaces : pour les libellés et l'écran d'affectation. */
  allAccounts: Account[];
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
  "income_source",
  "pea_plan_id",
  "pea_manual",
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
    space_id: row.space_id ? String(row.space_id) : null,
    match_keywords: Array.isArray(row.match_keywords)
      ? (row.match_keywords as unknown[]).map(String)
      : [],
    base_balance: Number(row.base_balance ?? 0),
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
    income_source: row.income_source ? String(row.income_source) : null,
    pea_plan_id: row.pea_plan_id ? String(row.pea_plan_id) : null,
    pea_manual: Boolean(row.pea_manual),
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
      peaInvestmentPlans: [],
      dismissedSuggestionKeys: [],
      subscriptionsSchemaReady: false,
      categoriesSchemaReady: false,
      savingsSchemaReady: false,
      monthlySpending: [],
      bankConnection: null,
      bankConnections: [],
      spaces: [],
      activeSpace: null,
      allAccounts: [],
      isDemo: false,
    };
  }

  const [
    { rows: accountRows },
    { rows: connectionRows },
    { rows: spaceRows },
    { rows: recurringRows, error: recurringError },
    { rows: dismissalRows, error: dismissalError },
    { rows: savingsRows, error: savingsError },
    { rows: adjustmentRows, error: adjustmentError },
    { rows: peaPlanRows },
    { rows: peaHoldingRows },
  ] = await Promise.all([
    readRows(supabase.from("accounts").select("*").order("name")),
    readRows(
      sections.bankConnection === false
        ? null
        : supabase
            .from("bank_connections")
            .select("*")
            .order("created_at", { ascending: false }),
    ),
    readRows(
      supabase
        .from("spaces")
        .select("*")
        .eq("user_id", user.id)
        .order("position", { ascending: true }),
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
    readRows(
      supabase
        .from("pea_investment_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at"),
    ),
    readRows(
      supabase
        .from("pea_holdings")
        .select("id, user_id, isin, ticker, name, quantity, cost_basis_eur")
        .eq("user_id", user.id),
    ),
  ]);

  let accounts = accountRows.map((row) => mapAccount(row));

  // Second étage : transactions et catégories ne dépendent que des comptes,
  // donc ils partent ensemble au lieu de s'enchaîner.
  const accountIds = accounts.map((account) => account.id);
  const [transactionResult, categoryResult] = await Promise.all([
    accountIds.length > 0
      ? fetchTransactionRows(supabase, accountIds)
      : Promise.resolve({ rows: [], error: null }),
    fetchCategories(supabase, user.id),
  ]);

  const bankConnections = connectionRows.map((row) => mapBankConnection(row));
  const spaces = spaceRows.map((row) => mapSpace(row));
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

  const peaInvestmentPlans = peaPlanRows.map((row) =>
    mapPeaInvestmentPlan(row),
  );

  transactions = annotateSavingsTransfers(transactions, savingsAccounts);
  transactions = annotatePeaTransfers(
    transactions,
    peaInvestmentPlans,
    peaHoldingRows.map((row) => mapPeaHolding(row)),
  );
  // En dernier : un virement déjà reconnu comme versement d'épargne garde sa
  // qualification, plus parlante qu'un simple déplacement entre comptes.
  transactions = annotateAccountTransfers(transactions, accounts, spaces);
  // Le solde d'une pocket n'est déclaré par personne : il se déduit des
  // virements qu'on vient de reconnaître.
  accounts = withManualBalances(accounts, transactions);

  return {
    accounts,
    transactions,
    categories,
    recurringPayments,
    savingsAccounts,
    savingsAdjustments,
    peaInvestmentPlans,
    dismissedSuggestionKeys: dismissalRows.map((row) =>
      String(row.cluster_key),
    ),
    subscriptionsSchemaReady: !recurringError && !dismissalError,
    categoriesSchemaReady,
    savingsSchemaReady,
    monthlySpending: buildMonthlySpending(transactions, locale),
    bankConnection: bankConnections[0] ?? null,
    bankConnections,
    spaces,
    activeSpace: null,
    allAccounts: accounts,
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
      peaInvestmentPlans: [],
      dismissedSuggestionKeys: [],
      subscriptionsSchemaReady: false,
      categoriesSchemaReady: false,
      savingsSchemaReady: false,
      monthlySpending: [],
      bankConnection: null,
      bankConnections: [],
      spaces: [],
      activeSpace: null,
      allAccounts: [],
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
      peaInvestmentPlans: [],
      monthlySpending: MOCK_MONTHLY_SPENDING,
      dismissedSuggestionKeys: [],
      bankConnection: null,
      bankConnections: [],
      spaces: [],
      activeSpace: null,
      allAccounts: MOCK_ACCOUNTS,
      isDemo: true,
      subscriptionsSchemaReady: true,
      categoriesSchemaReady: true,
      savingsSchemaReady: true,
    };
  }

  const data = await fetchFromSupabase(user, locale, sections);
  return scopeFinanceDataToSpace(data, await getActiveSpace(), locale);
}

/**
 * Restreint les données à l'espace actif.
 *
 * Un seul endroit pour toute l'application : les pages et les agrégats
 * travaillent ensuite sur des tableaux déjà filtrés, sans rien savoir des
 * espaces. `allAccounts` reste complet, parce qu'afficher « virement vers le
 * compte joint » demande un nom qui vit dans l'autre espace.
 */
function scopeFinanceDataToSpace(
  data: FinanceData,
  activeSpace: Space | null,
  locale: string,
): FinanceData {
  // Un seul espace : rien à filtrer, et surtout rien à cacher.
  if (!activeSpace || data.spaces.length < 2) {
    return { ...data, activeSpace };
  }

  const fallbackId = defaultSpace(data.spaces)?.id ?? null;
  const belongs = (spaceId: string | null | undefined): boolean =>
    (spaceId ?? fallbackId) === activeSpace.id;

  const accounts = data.allAccounts.filter((account) =>
    belongs(account.space_id),
  );
  const accountIds = new Set(accounts.map((account) => account.id));
  const transactions = data.transactions.filter((tx) =>
    accountIds.has(tx.account_id),
  );

  return {
    ...data,
    activeSpace,
    accounts,
    transactions,
    recurringPayments: data.recurringPayments.filter((rule) =>
      belongs(rule.space_id),
    ),
    monthlySpending: buildMonthlySpending(transactions, locale),
  };
}
