/**
 * @file sync.ts
 * @description Orchestration de la synchronisation Enable Banking → Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTransactions } from "@/lib/enable-banking/client";
import { mapEnableBankingTransaction } from "@/lib/enable-banking/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Synchronise les transactions de tous les comptes liés à un utilisateur.
 * @param userId - UUID Supabase Auth
 * @param strategy - `longest` pour première sync, `default` ensuite
 * @param supabaseClient - Client optionnel (service role pour cron)
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

    let continuationKey: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchTransactions(account.external_uid, {
        dateFrom,
        strategy,
        continuationKey,
      });

      const rows = response.transactions.map((tx) => {
        const mapped = mapEnableBankingTransaction(tx);
        return {
          account_id: account.id,
          ...mapped,
        };
      });

      if (rows.length > 0) {
        const { error } = await supabase.from("transactions").upsert(rows, {
          onConflict: "account_id,entry_reference",
        });
        if (error) throw error;
        synced += rows.length;
      }

      continuationKey = response.continuation_key ?? undefined;
      hasMore = Boolean(continuationKey);
    }
  }

  return { synced };
}
