/**
 * @file rematch-categories.ts
 * @description Ré-attribution automatique des catégories sur les dépenses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeCategories,
  ensureDefaultCategories,
  findMatchingCategory,
} from "@/lib/finance/expense-categories";
import { createClient } from "@/lib/supabase/server";

export async function rematchCategoriesForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<{ matched: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { categories: loadedCategories } = await ensureDefaultCategories(
    supabase,
    userId,
  );
  const categories = dedupeCategories(loadedCategories);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  if (accountsError) throw accountsError;
  if (!accounts?.length) {
    return { matched: 0 };
  }

  let matched = 0;

  for (const account of accounts) {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        "id, amount, description, category_id, category_manual, recurring_payment_id",
      )
      .eq("account_id", account.id)
      .lt("amount", 0);

    if (error) throw error;
    if (!transactions?.length) continue;

    for (const tx of transactions) {
      if (tx.category_manual || tx.recurring_payment_id) {
        continue;
      }

      const category = findMatchingCategory(
        {
          amount: Number(tx.amount),
          description: String(tx.description),
        },
        categories,
      );
      const nextId = category?.id ?? null;

      if (tx.category_id === nextId) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("transactions")
        .update({ category_id: nextId })
        .eq("id", tx.id);

      if (updateError) throw updateError;

      if (nextId) {
        matched += 1;
      }
    }
  }

  return { matched };
}
