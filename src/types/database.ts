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

/** Mouvement d'épargne associé à une transaction (virement vers/depuis un livret). */
export interface SavingsTransferRef {
  account_id: string;
  account_name: string;
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
}
