/**
 * @file sync.ts
 * @description Orchestration de la synchronisation Enable Banking → Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBalances, fetchTransactions } from "@/lib/enable-banking/client";
import {
  mapEnableBankingTransaction,
  mapEnableBankingTransactions,
  pickAccountBalance,
  type EnableBankingTransactionResource,
} from "@/lib/enable-banking/types";
import { inferIndicatorsFromBalanceSequence } from "@/lib/enable-banking/transaction-sign";
import { rematchRecurringPaymentsForUser } from "@/lib/finance/rematch-recurring-payments";
import { createClient } from "@/lib/supabase/server";

function sortStoredTransactions<
  T extends { booking_date: string; entry_reference: string },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dateCompare = a.booking_date.localeCompare(b.booking_date);
    if (dateCompare !== 0) return dateCompare;
    return a.entry_reference.localeCompare(b.entry_reference);
  });
}

/**
 * Met à jour les soldes de tous les comptes liés à Enable Banking.
 */
export async function refreshAccountBalances(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<{ updated: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, external_uid")
    .eq("user_id", userId)
    .not("external_uid", "is", null);

  if (accountsError) throw accountsError;
  if (!accounts?.length) return { updated: 0 };

  let updated = 0;

  for (const account of accounts) {
    if (!account.external_uid) continue;

    const { balances } = await fetchBalances(account.external_uid);
    const balance = pickAccountBalance(balances);

    const { error } = await supabase
      .from("accounts")
      .update({ balance })
      .eq("id", account.id);

    if (error) throw error;
    updated += 1;
  }

  return { updated };
}

/**
 * Recalcule le montant signé de toutes les transactions stockées (raw_json).
 */
export async function remapStoredTransactions(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<{ remapped: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  if (accountsError) throw accountsError;
  if (!accounts?.length) return { remapped: 0 };

  let remapped = 0;

  for (const account of accounts) {
    const { data: rows, error } = await supabase
      .from("transactions")
      .select("id, booking_date, entry_reference, raw_json")
      .eq("account_id", account.id)
      .not("raw_json", "is", null);

    if (error) throw error;
    if (!rows?.length) continue;

    const sortedRows = sortStoredTransactions(rows);
    const rawTransactions = sortedRows.map(
      (row) => row.raw_json as EnableBankingTransactionResource,
    );
    const balanceIndicators = inferIndicatorsFromBalanceSequence(rawTransactions);

    for (let index = 0; index < sortedRows.length; index += 1) {
      const mapped = mapEnableBankingTransaction(
        rawTransactions[index],
        balanceIndicators[index],
      );

      const { error: updateError } = await supabase
        .from("transactions")
        .update({ amount: mapped.amount })
        .eq("id", sortedRows[index].id);

      if (updateError) throw updateError;
      remapped += 1;
    }
  }

  return { remapped };
}

/**
 * Synchronise les transactions de tous les comptes liés à un utilisateur.
 */
export async function syncUserTransactions(
  userId: string,
  strategy: "default" | "longest" = "default",
  supabaseClient?: SupabaseClient,
): Promise<{ synced: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, external_uid, updated_at")
    .eq("user_id", userId)
    .not("external_uid", "is", null);

  if (accountsError) throw accountsError;
  if (!accounts?.length) return { synced: 0 };

  let synced = 0;

  for (const account of accounts) {
    if (!account.external_uid) continue;

    const dateFrom =
      strategy === "default"
        ? new Date(account.updated_at).toISOString().slice(0, 10)
        : undefined;

    const apiTransactions: EnableBankingTransactionResource[] = [];
    let continuationKey: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchTransactions(account.external_uid, {
        dateFrom,
        strategy,
        continuationKey,
      });

      apiTransactions.push(...response.transactions);
      continuationKey = response.continuation_key ?? undefined;
      hasMore = Boolean(continuationKey);
    }

    const rows = mapEnableBankingTransactions(apiTransactions).map((mapped) => ({
      account_id: account.id,
      ...mapped,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("transactions").upsert(rows, {
        onConflict: "account_id,entry_reference",
      });
      if (error) throw error;
      synced += rows.length;
    }
  }

  return { synced };
}

/**
 * Sync complète : soldes + transactions + recalcul historique.
 */
export async function syncUserFinanceData(
  userId: string,
  strategy: "default" | "longest" = "default",
  supabaseClient?: SupabaseClient,
) {
  await refreshAccountBalances(userId, supabaseClient);
  const { synced } = await syncUserTransactions(userId, strategy, supabaseClient);
  const { remapped } =
    strategy === "longest"
      ? await remapStoredTransactions(userId, supabaseClient)
      : { remapped: 0 };

  const { matched } = await rematchRecurringPaymentsForUser(
    userId,
    supabaseClient,
  );

  return { synced, remapped, matched };
}
