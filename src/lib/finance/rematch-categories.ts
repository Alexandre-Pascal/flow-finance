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
import type { Category } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

/**
 * Applique les mises à jour groupées par catégorie cible.
 *
 * Une transaction par catégorie au lieu d'un UPDATE par ligne : sur un
 * historique de plusieurs centaines de dépenses, cela ramène des centaines
 * d'allers-retours séquentiels à une poignée de requêtes.
 */
async function applyCategoryUpdates(
  supabase: SupabaseClient,
  updatesByCategory: Map<string | null, string[]>,
): Promise<void> {
  for (const [categoryId, transactionIds] of updatesByCategory) {
    // PostgREST encode les filtres dans l'URL : on découpe pour ne pas
    // dépasser la taille maximale d'une requête.
    for (let start = 0; start < transactionIds.length; start += 200) {
      const chunk = transactionIds.slice(start, start + 200);

      const { error } = await supabase
        .from("transactions")
        .update({ category_id: categoryId })
        .in("id", chunk);

      if (error) throw error;
    }
  }
}

export async function rematchCategoriesForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
  options?: { onlyUncategorized?: boolean; categories?: Category[] },
): Promise<{ matched: number }> {
  const supabase = supabaseClient ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  // Les appelants qui viennent de charger les catégories les passent ici, ce
  // qui évite de rejouer tout le cycle SELECT/UPDATE/SELECT de la synchro.
  const categories =
    options?.categories ??
    dedupeCategories((await syncDefaultCategories(supabase, userId)).categories);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId);

  if (accountsError) throw accountsError;
  if (!accounts?.length) {
    return { matched: 0 };
  }

  const accountIds = accounts.map((account) => String(account.id));

  // Une seule requête pour tous les comptes, au lieu d'une par compte.
  let query = supabase
    .from("transactions")
    .select("id, amount, description, category_id")
    .in("account_id", accountIds)
    .lt("amount", 0)
    .eq("category_manual", false)
    .is("recurring_payment_id", null);

  if (options?.onlyUncategorized) {
    query = query.is("category_id", null);
  }

  const { data: transactions, error } = await query;

  if (error) throw error;
  if (!transactions?.length) {
    return { matched: 0 };
  }

  const updatesByCategory = new Map<string | null, string[]>();
  let matched = 0;

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

    const bucket = updatesByCategory.get(nextId);
    if (bucket) {
      bucket.push(String(tx.id));
    } else {
      updatesByCategory.set(nextId, [String(tx.id)]);
    }

    if (nextId) {
      matched += 1;
    }
  }

  await applyCategoryUpdates(supabase, updatesByCategory);

  return { matched };
}
