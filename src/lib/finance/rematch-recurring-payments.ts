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

/**
 * Applique les mises à jour groupées par abonnement cible, plutôt qu'un UPDATE
 * séquentiel par transaction.
 */
async function applyRecurringUpdates(
  supabase: SupabaseClient,
  updatesByPayment: Map<string | null, string[]>,
): Promise<void> {
  for (const [recurringPaymentId, transactionIds] of updatesByPayment) {
    for (let start = 0; start < transactionIds.length; start += 200) {
      const chunk = transactionIds.slice(start, start + 200);

      const { error } = await supabase
        .from("transactions")
        .update({ recurring_payment_id: recurringPaymentId })
        .in("id", chunk);

      if (error) throw error;
    }
  }
}

export async function rematchRecurringPaymentsForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<{ matched: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const [
    { data: rules, error: rulesError },
    { data: accounts, error: accountsError },
  ] = await Promise.all([
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

  const accountIds = accounts.map((account) => String(account.id));

  // Une seule requête pour tous les comptes, au lieu d'une par compte.
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, amount, description, booking_date, recurring_payment_id")
    .in("account_id", accountIds)
    .lt("amount", 0)
    .eq("recurring_payment_manual", false);

  if (error) throw error;
  if (!transactions?.length) {
    return { matched: 0 };
  }

  const updatesByPayment = new Map<string | null, string[]>();
  let matched = 0;

  for (const tx of transactions) {
    const rule = findMatchingRecurringPayment(
      {
        amount: Number(tx.amount),
        description: String(tx.description),
        booking_date: String(tx.booking_date),
      },
      recurringRules,
    );
    const nextId = rule?.id ?? null;

    if (tx.recurring_payment_id === nextId) {
      continue;
    }

    const bucket = updatesByPayment.get(nextId);
    if (bucket) {
      bucket.push(String(tx.id));
    } else {
      updatesByPayment.set(nextId, [String(tx.id)]);
    }

    if (nextId) {
      matched += 1;
    }
  }

  await applyRecurringUpdates(supabase, updatesByPayment);

  return { matched };
}
