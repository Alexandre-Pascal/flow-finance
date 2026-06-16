/**
 * @file types.ts
 * @description Types et mappers pour les réponses Enable Banking API.
 */

export interface EnableBankingAspsp {
  name: string;
  country: string;
}

export interface EnableBankingAuthResponse {
  url: string;
}

export interface EnableBankingAccountResource {
  uid: string;
  account_id?: {
    iban?: string;
  };
  name?: string;
  currency?: string;
}

export interface EnableBankingSessionResponse {
  session_id: string;
  accounts: EnableBankingAccountResource[];
}

export interface EnableBankingTransactionResource {
  entry_reference?: string;
  booking_date?: string;
  credit_debit_indicator?: "CRDT" | "DBIT";
  transaction_amount?: {
    amount: string;
    currency: string;
  };
  remittance_information?: string[];
  status?: string;
}

export interface EnableBankingBalanceResource {
  name?: string;
  balance_amount?: {
    amount: string;
    currency: string;
  };
  balance_type?: string;
}

export interface EnableBankingBalancesResponse {
  balances: EnableBankingBalanceResource[];
}

export interface EnableBankingTransactionsResponse {
  transactions: EnableBankingTransactionResource[];
  continuation_key?: string | null;
}

import {
  mapSignedTransactionAmount,
  resolveCreditDebitIndicator,
} from "@/lib/enable-banking/transaction-sign";
const BALANCE_TYPE_PRIORITY = ["CLAV", "ITAV", "CLBD", "OPBD", "ITBD"];

/**
 * Extrait le solde courant depuis la réponse balances Enable Banking.
 */
export function pickAccountBalance(
  balances: EnableBankingBalanceResource[],
): number {
  for (const type of BALANCE_TYPE_PRIORITY) {
    const match = balances.find((balance) => balance.balance_type === type);
    if (match?.balance_amount?.amount) {
      return Number(match.balance_amount.amount);
    }
  }

  const first = balances[0]?.balance_amount?.amount;
  return first ? Number(first) : 0;
}

/**
 * Mappe une transaction Enable Banking vers le format interne d'upsert.
 */
export function mapEnableBankingTransaction(
  tx: EnableBankingTransactionResource,
) {
  const description =
    tx.remittance_information?.join(" ") ?? "Transaction bancaire";
  const indicator = resolveCreditDebitIndicator(
    tx.credit_debit_indicator,
    description,
  );
  const amount = mapSignedTransactionAmount(
    tx.transaction_amount?.amount,
    indicator,
  );

  return {
    entry_reference: tx.entry_reference ?? `${tx.booking_date}-${amount}-${description}`,
    booking_date: tx.booking_date ?? new Date().toISOString().slice(0, 10),
    amount,
    currency: tx.transaction_amount?.currency ?? "EUR",
    description,
    status: tx.status === "PDNG" ? ("PDNG" as const) : ("BOOK" as const),
    raw_json: tx,
  };
}
