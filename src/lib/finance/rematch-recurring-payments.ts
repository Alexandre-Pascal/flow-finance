/**
 * @file rematch-recurring-payments.ts
 * @description Ré-attribution serveur des abonnements sur les transactions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findMatchingRecurringPayment,
  mapRecurringPayment,
} from "@/lib/finance/recurring-payments";
import { createClient } from "@/lib/supabase/server";

export async function rematchRecurringPaymentsForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<{ matched: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const [{ data: rules, error: rulesError }, { data: accounts, error: accountsError }] =
    await Promise.all([
      supabase.from("recurring_payments").select("*").eq("user_id", userId),
      supabase.from("accounts").select("id").eq("user_id", userId),
    ]);

  if (rulesError) throw rulesError;
  if (accountsError) throw accountsError;

  const recurringRules = (rules ?? []).map((row) =>
    mapRecurringPayment(row as Record<string, unknown>),
  );

  if (!accounts?.length) {
    return { matched: 0 };
  }

  let matched = 0;

  for (const account of accounts) {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, amount, description, recurring_payment_id")
      .eq("account_id", account.id)
      .lt("amount", 0);

    if (error) throw error;
    if (!transactions?.length) continue;

    for (const tx of transactions) {
      const rule = findMatchingRecurringPayment(
        {
          amount: Number(tx.amount),
          description: String(tx.description),
        },
        recurringRules,
      );
      const nextId = rule?.id ?? null;

      if (tx.recurring_payment_id === nextId) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("transactions")
        .update({ recurring_payment_id: nextId })
        .eq("id", tx.id);

      if (updateError) throw updateError;

      if (nextId) {
        matched += 1;
      }
    }
  }

  return { matched };
}
