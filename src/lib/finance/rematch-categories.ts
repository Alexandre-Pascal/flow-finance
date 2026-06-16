/**
 * @file rematch-categories.ts
 * @description Ré-attribution automatique des catégories sur les dépenses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeCategories,
  findMatchingCategory,
  shouldAutoCategorize,
  syncDefaultCategories,
} from "@/lib/finance/expense-categories";
import { createClient } from "@/lib/supabase/server";

export async function rematchCategoriesForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
  options?: { onlyUncategorized?: boolean },
): Promise<{ matched: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { categories: loadedCategories } = await syncDefaultCategories(
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
    let query = supabase
      .from("transactions")
      .select(
        "id, amount, description, category_id, category_manual, recurring_payment_id",
      )
      .eq("account_id", account.id)
      .lt("amount", 0)
      .eq("category_manual", false)
      .is("recurring_payment_id", null);

    if (options?.onlyUncategorized) {
      query = query.is("category_id", null);
    }

    const { data: transactions, error } = await query;

    if (error) throw error;
    if (!transactions?.length) continue;

    for (const tx of transactions) {
      if (!shouldAutoCategorize(String(tx.description))) {
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
