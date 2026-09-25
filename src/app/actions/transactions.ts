"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TransactionNoteError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save";

const NOTE_MAX_LENGTH = 280;

function revalidateFinancePages() {
  revalidatePath("/fr/transactions");
  revalidatePath("/en/transactions");
  revalidatePath("/fr/analytics");
  revalidatePath("/en/analytics");
  revalidatePath("/fr");
  revalidatePath("/en");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("note") ||
    normalized.includes("income_source") ||
    normalized.includes("transfer_account_id") ||
    normalized.includes("transfer_manual") ||
    normalized.includes("does not exist")
  );
}

export async function updateTransactionNoteAction(
  formData: FormData,
): Promise<{ error?: TransactionNoteError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  if (!transactionId) {
    return { error: "invalid" };
  }

  const rawNote = String(formData.get("note") ?? "").trim();
  const note = rawNote.length === 0 ? null : rawNote.slice(0, NOTE_MAX_LENGTH);

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, account_id")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError) {
    return isSchemaError(txError.message, txError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  if (!tx) {
    return { error: "invalid" };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", tx.account_id)
    .maybeSingle();

  if (accountError || account?.user_id !== user.id) {
    return { error: "invalid" };
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ note })
    .eq("id", transactionId);

  if (updateError) {
    return isSchemaError(updateError.message, updateError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateFinancePages();
  return {};
}

/**
 * Rattache une rentrée à une source de revenu : « payroll » pour le salaire,
 * l'identifiant d'une source suivie sinon. « auto » rend la main aux mots-clés.
 */
export async function assignTransactionIncomeSourceAction(
  formData: FormData,
): Promise<{ error?: TransactionNoteError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const raw = String(formData.get("incomeSource") ?? "").trim();
  if (!transactionId) {
    return { error: "invalid" };
  }

  const incomeSource = raw === "" || raw === "auto" ? null : raw.slice(0, 64);

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, account_id, amount")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError) {
    return isSchemaError(txError.message, txError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  // Seule une rentrée se rattache à une source de revenu.
  if (!tx || Number(tx.amount) <= 0) {
    return { error: "invalid" };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", tx.account_id)
    .maybeSingle();

  if (accountError || account?.user_id !== user.id) {
    return { error: "invalid" };
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ income_source: incomeSource })
    .eq("id", transactionId);

  if (updateError) {
    return isSchemaError(updateError.message, updateError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateFinancePages();
  return {};
}

/**
 * Rattache une transaction à un autre compte de l'utilisateur, ou la détache.
 *
 * « auto » rend la main à la détection par libellé ; « none » déclare
 * explicitement que la ligne n'est pas un virement, ce que la détection ne doit
 * plus contredire.
 */
export async function assignTransactionTransferAccountAction(
  formData: FormData,
): Promise<{ error?: TransactionNoteError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const raw = String(formData.get("transferAccountId") ?? "").trim();
  if (!transactionId) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, account_id")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError) {
    return isSchemaError(txError.message, txError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  if (!tx) {
    return { error: "invalid" };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", tx.account_id)
    .maybeSingle();

  if (accountError || account?.user_id !== user.id) {
    return { error: "invalid" };
  }

  let payload: { transfer_account_id: string | null; transfer_manual: boolean };

  if (raw === "" || raw === "auto") {
    payload = { transfer_account_id: null, transfer_manual: false };
  } else if (raw === "none") {
    payload = { transfer_account_id: null, transfer_manual: true };
  } else {
    // La contrepartie doit être un autre compte de l'utilisateur.
    const { data: counterpart, error: counterpartError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", raw)
      .eq("user_id", user.id)
      .maybeSingle();

    if (counterpartError) {
      return isSchemaError(counterpartError.message, counterpartError.code)
        ? { error: "schema" }
        : { error: "save" };
    }
    if (!counterpart || counterpart.id === tx.account_id) {
      return { error: "invalid" };
    }

    payload = { transfer_account_id: raw, transfer_manual: true };
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", transactionId);

  if (updateError) {
    return isSchemaError(updateError.message, updateError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateFinancePages();
  return {};
}
