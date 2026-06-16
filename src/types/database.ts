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
  recurring_payment_id: string | null;
  recurring_payment_manual: boolean;
  created_at: string;
  updated_at: string;
}

export type RecurringCadence = "monthly" | "yearly";

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

/** Transaction enrichie pour l'affichage UI (jointure compte). */
export interface TransactionWithAccount extends Transaction {
  account_name: string;
  account_type: AccountType;
  recurring_payment_name?: string | null;
}
