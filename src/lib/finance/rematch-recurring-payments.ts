/**
 * @file rematch-recurring-payments.ts
 * @description Ré-attribution serveur des abonnements sur les transactions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignRecurringPayments,
  mapRecurringPayment,
} from "@/lib/finance/recurring-payments";
import { matchAccountTransfer } from "@/lib/finance/account-transfers";
import { defaultSpace, mapSpace } from "@/lib/finance/spaces";
import type { Account } from "@/types/database";
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
    { data: spaceRows },
  ] = await Promise.all([
    supabase.from("recurring_payments").select("*").eq("user_id", userId),
    supabase
      .from("accounts")
      .select("id, name, space_id")
      .eq("user_id", userId),
    supabase
      .from("spaces")
      .select("*")
      .eq("user_id", userId)
      .order("position", { ascending: true }),
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
    .select(
      "id, account_id, amount, description, booking_date, recurring_payment_id, transfer_account_id, transfer_manual",
    )
    .in("account_id", accountIds)
    .lt("amount", 0)
    .eq("recurring_payment_manual", false);

  if (error) throw error;
  if (!transactions?.length) {
    return { matched: 0 };
  }

  const updatesByPayment = new Map<string | null, string[]>();
  let matched = 0;

  // Chaque espace se rattache séparément : une règle du budget perso n'a pas à
  // capter une dépense du compte joint, et le quota « un prélèvement par mois »
  // se compte par espace.
  const fallbackSpaceId =
    defaultSpace((spaceRows ?? []).map((row) => mapSpace(row)))?.id ?? null;
  const spaceByAccount = new Map(
    accounts.map((account) => [
      String(account.id),
      (account.space_id ? String(account.space_id) : null) ?? fallbackSpaceId,
    ]),
  );
  const spaceKey = (value: string | null) => value ?? "__none__";

  // Un virement entre comptes revient chaque mois avec le même libellé : sans
  // l'écarter, il deviendrait un abonnement, quitterait la rubrique « Compte
  // joint » et polluerait la liste de l'espace.
  const accountObjects = accounts.map(
    (account) =>
      ({
        id: String(account.id),
        name: String(account.name ?? ""),
        space_id: account.space_id ? String(account.space_id) : null,
      }) as Account,
  );
  const isTransfer = (tx: (typeof transactions)[number]): boolean =>
    tx.transfer_manual
      ? Boolean(tx.transfer_account_id)
      : matchAccountTransfer(
          {
            account_id: String(tx.account_id),
            description: String(tx.description),
          },
          accountObjects,
        ) !== null;

  const rulesBySpace = new Map<string, typeof recurringRules>();
  for (const rule of recurringRules) {
    const key = spaceKey(rule.space_id ?? fallbackSpaceId);
    rulesBySpace.set(key, [...(rulesBySpace.get(key) ?? []), rule]);
  }

  const assignment = new Map<string, string | null>();
  const transactionsBySpace = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    if (isTransfer(tx)) {
      continue;
    }
    const key = spaceKey(spaceByAccount.get(String(tx.account_id)) ?? null);
    transactionsBySpace.set(key, [...(transactionsBySpace.get(key) ?? []), tx]);
  }

  for (const [key, spaceTransactions] of transactionsBySpace) {
    const spaceAssignment = assignRecurringPayments(
      spaceTransactions.map((tx) => ({
        id: String(tx.id),
        amount: Number(tx.amount),
        description: String(tx.description),
        booking_date: String(tx.booking_date),
      })),
      rulesBySpace.get(key) ?? [],
    );
    for (const [txId, ruleId] of spaceAssignment) {
      assignment.set(txId, ruleId);
    }
  }

  for (const tx of transactions) {
    const nextId = assignment.get(String(tx.id)) ?? null;

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
