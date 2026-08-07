/**
 * @file database.ts
 * @description Types TypeScript alignés sur le schéma Supabase de Flow Finance.
 */

export type AccountType = "checking" | "savings";

export type TransactionStatus = "BOOK" | "PDNG";

export type BankConnectionStatus = "active" | "expired" | "revoked" | "pending";

export interface Profile {
  id: string;
  locale: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  session_id: string | null;
  aspsp_name: string | null;
  valid_until: string | null;
  status: BankConnectionStatus;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  connection_id: string | null;
  external_uid: string | null;
  name: string;
  iban: string | null;
  type: AccountType;
  balance: number;
  currency: string;
  last_transactions_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  entry_reference: string;
  booking_date: string;
  amount: number;
  currency: string;
  description: string;
  status: TransactionStatus;
  category_id: string | null;
  category_manual: boolean;
  recurring_payment_id: string | null;
  recurring_payment_manual: boolean;
  note: string | null;
  /** Affectation manuelle à un compte d'épargne (prime sur les mots-clés). */
  savings_account_id?: string | null;
  savings_account_manual?: boolean;
  /** Affectation manuelle à un plan d'investissement PEA (prime sur les mots-clés). */
  pea_plan_id?: string | null;
  pea_manual?: boolean;
  created_at: string;
  updated_at: string;
}

export type SavingsAccountKind =
  | "livret_a"
  | "ldd"
  | "lep"
  | "livret_jeune"
  | "pel"
  | "cel"
  | "other";

export interface SavingsAccount {
  id: string;
  user_id: string;
  name: string;
  kind: SavingsAccountKind;
  color: string;
  base_balance: number;
  base_date: string;
  interest_rate: number | null;
  ceiling: number | null;
  opening_date: string | null;
  deposit_keywords: string[];
  withdrawal_keywords: string[];
  created_at: string;
  updated_at: string;
}

export type SavingsAdjustmentKind = "cash" | "check" | "interest";

export interface SavingsAdjustment {
  id: string;
  user_id: string;
  savings_account_id: string;
  kind: SavingsAdjustmentKind;
  amount: number;
  adjustment_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurringCadence = "monthly" | "yearly";

export interface RecurringSuggestionDismissal {
  id: string;
  user_id: string;
  cluster_key: string;
  source: "paypal" | "general";
  amount: number;
  billing_day: number;
  billing_month: number | null;
  cadence: RecurringCadence;
  description_pattern: string;
  created_at: string;
}

export interface RecurringPayment {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  amount_tolerance: number;
  description_pattern: string;
  billing_day: number | null;
  cadence: RecurringCadence;
  billing_month: number | null;
  /**
   * Règle rattachée à un autre abonnement : le même service reconnu via un
   * second libellé bancaire (ex. ère PayPal puis prélèvement direct).
   */
  merged_into_id: string | null;
  /** Dernier jour de validité : au-delà, la règle ne capte plus de transaction. */
  active_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  keyword_rules: string[];
  created_at: string;
}

export type CryptoTransactionKind = "buy" | "sell" | "deposit" | "withdrawal";

export interface CryptoHolding {
  id: string;
  user_id: string;
  name: string;
  xpub: string | null;
  symbol: string;
  quantity: number;
  cost_basis_eur: number;
  created_at: string;
  updated_at: string;
}

export interface CryptoTransaction {
  id: string;
  user_id: string;
  holding_id: string;
  kind: CryptoTransactionKind;
  quantity: number;
  amount_eur: number;
  transaction_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type PeaTransactionKind =
  | "buy"
  | "sell"
  | "dividend"
  | "deposit"
  | "withdrawal"
  | "fee"
  | "interest";

/**
 * Origine d'un mouvement PEA : `csv` fait autorité (export Trade Republic),
 * `bank_estimate` est une estimation déduite d'un virement bancaire détecté,
 * remplacée par le CSV à l'import.
 */
export type PeaTransactionSource = "csv" | "bank_estimate" | "manual";

export interface PeaHolding {
  id: string;
  user_id: string;
  isin: string;
  ticker: string | null;
  name: string;
  quantity: number;
  cost_basis_eur: number;
  manual_price_eur: number | null;
  created_at: string;
  updated_at: string;
}

export interface PeaTransaction {
  id: string;
  user_id: string;
  holding_id: string | null;
  kind: PeaTransactionKind;
  quantity: number;
  amount_eur: number;
  transaction_date: string;
  note: string | null;
  source: PeaTransactionSource;
  external_ref: string | null;
  bank_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeaInvestmentPlan {
  id: string;
  user_id: string;
  label: string;
  keywords: string[];
  holding_id: string | null;
  expected_amount_eur: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PeaSettings {
  user_id: string;
  opening_date: string | null;
  cash_balance_eur: number;
  created_at: string;
  updated_at: string;
}

/** Mouvement d'épargne associé à une transaction (virement vers/depuis un livret). */
export interface SavingsTransferRef {
  account_id: string;
  account_name: string;
  direction: "deposit" | "withdrawal";
}

/** Virement vers le PEA associé à une transaction (plan d'investissement détecté). */
export interface PeaTransferRef {
  plan_id: string;
  plan_label: string;
  holding_id: string | null;
  holding_name: string | null;
  direction: "deposit" | "withdrawal";
}

/** Transaction enrichie pour l'affichage UI (jointure compte). */
export interface TransactionWithAccount extends Transaction {
  account_name: string;
  account_type: AccountType;
  recurring_payment_name?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  savings_transfer?: SavingsTransferRef | null;
  pea_transfer?: PeaTransferRef | null;
}
