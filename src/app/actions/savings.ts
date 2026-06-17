"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  isValidHexColor,
  normalizeColor,
} from "@/lib/finance/expense-categories";
import { SAVINGS_ADJUSTMENT_KINDS, SAVINGS_KINDS } from "@/lib/finance/savings";
import { createClient } from "@/lib/supabase/server";
import type { SavingsAccountKind, SavingsAdjustmentKind } from "@/types/database";

export type SavingsActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save";

function revalidateSavingsPages() {
  revalidatePath("/fr/savings");
  revalidatePath("/en/savings");
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
    normalized.includes("savings_accounts") ||
    normalized.includes("savings_adjustments") ||
    normalized.includes("does not exist")
  );
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((keyword) => keyword.trim().toUpperCase())
    .filter((keyword) => keyword.length >= 2);
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseKind(raw: string): SavingsAccountKind {
  return (SAVINGS_KINDS as string[]).includes(raw)
    ? (raw as SavingsAccountKind)
    : "other";
}

function buildPayload(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = parseKind(String(formData.get("kind") ?? "other"));
  const requestedColor = String(formData.get("color") ?? "").trim();
  const baseBalance = parseAmount(String(formData.get("baseBalance") ?? "0"));
  const baseDate = String(formData.get("baseDate") ?? "").trim();
  const interestRaw = String(formData.get("interestRate") ?? "").trim();
  const ceilingRaw = String(formData.get("ceiling") ?? "").trim();
  const openingDate = String(formData.get("openingDate") ?? "").trim();
  const depositKeywords = parseKeywords(
    String(formData.get("depositKeywords") ?? ""),
  );
  const withdrawalKeywords = parseKeywords(
    String(formData.get("withdrawalKeywords") ?? ""),
  );

  if (!name || baseBalance === null) {
    return null;
  }
  if (requestedColor && !isValidHexColor(requestedColor)) {
    return null;
  }

  return {
    name,
    kind,
    color: requestedColor ? normalizeColor(requestedColor) : "#1E3A8A",
    base_balance: baseBalance,
    base_date: baseDate || new Date().toISOString().slice(0, 10),
    interest_rate: interestRaw ? parseAmount(interestRaw) : null,
    ceiling: ceilingRaw ? parseAmount(ceilingRaw) : null,
    opening_date: openingDate || null,
    deposit_keywords: depositKeywords,
    withdrawal_keywords: withdrawalKeywords,
  };
}

export async function createSavingsAccountAction(
  formData: FormData,
): Promise<{ error?: SavingsActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const payload = buildPayload(formData);
  if (!payload) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("savings_accounts")
    .insert({ user_id: user.id, ...payload });

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSavingsPages();
  return {};
}

export async function updateSavingsAccountAction(
  formData: FormData,
): Promise<{ error?: SavingsActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const payload = buildPayload(formData);
  if (!id || !payload) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("savings_accounts")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSavingsPages();
  return {};
}

export async function assignTransactionSavingsAccountAction(
  formData: FormData,
): Promise<{ error?: SavingsActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const raw = String(formData.get("savingsAccountId") ?? "").trim();
  // "auto" → on revient à la détection par mots-clés.
  const savingsAccountId = raw === "auto" || raw === "" ? null : raw;

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

  if (savingsAccountId) {
    const { data: savings, error: savingsError } = await supabase
      .from("savings_accounts")
      .select("id")
      .eq("id", savingsAccountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (savingsError) {
      return isSchemaError(savingsError.message, savingsError.code)
        ? { error: "schema" }
        : { error: "save" };
    }
    if (!savings) {
      return { error: "invalid" };
    }
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      savings_account_id: savingsAccountId,
      savings_account_manual: savingsAccountId !== null,
    })
    .eq("id", transactionId);

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSavingsPages();
  return {};
}

export async function deleteSavingsAccountAction(
  formData: FormData,
): Promise<{ error?: SavingsActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("savings_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSavingsPages();
  return {};
}

function parseAdjustmentKind(raw: string): SavingsAdjustmentKind | null {
  return (SAVINGS_ADJUSTMENT_KINDS as string[]).includes(raw)
    ? (raw as SavingsAdjustmentKind)
    : null;
}

export async function createSavingsAdjustmentAction(
  formData: FormData,
): Promise<{ error?: SavingsActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const savingsAccountId = String(formData.get("savingsAccountId") ?? "").trim();
  const kind = parseAdjustmentKind(String(formData.get("kind") ?? ""));
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const adjustmentDate = String(formData.get("adjustmentDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!savingsAccountId || !kind || amount === null || amount <= 0) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: account, error: accountError } = await supabase
    .from("savings_accounts")
    .select("id")
    .eq("id", savingsAccountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) {
    return isSchemaError(accountError.message, accountError.code)
      ? { error: "schema" }
      : { error: "save" };
  }
  if (!account) {
    return { error: "invalid" };
  }

  const { error } = await supabase.from("savings_adjustments").insert({
    user_id: user.id,
    savings_account_id: savingsAccountId,
    kind,
    amount,
    adjustment_date: adjustmentDate || new Date().toISOString().slice(0, 10),
    note: note || null,
  });

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSavingsPages();
  return {};
}

export async function deleteSavingsAdjustmentAction(
  formData: FormData,
): Promise<{ error?: SavingsActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("savings_adjustments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSavingsPages();
  return {};
}
