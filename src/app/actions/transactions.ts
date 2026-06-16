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
