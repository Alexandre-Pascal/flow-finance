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
  transaction_amount?: {
    amount: string;
    currency: string;
  };
  remittance_information?: string[];
  status?: string;
}

export interface EnableBankingTransactionsResponse {
  transactions: EnableBankingTransactionResource[];
  continuation_key?: string | null;
}

/**
 * Mappe une transaction Enable Banking vers le format interne d'upsert.
 */
export function mapEnableBankingTransaction(
  tx: EnableBankingTransactionResource,
) {
  const amount = Number(tx.transaction_amount?.amount ?? 0);
  const description =
    tx.remittance_information?.join(" ") ?? "Transaction bancaire";

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
