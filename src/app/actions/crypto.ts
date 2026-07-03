"use server";

import { revalidatePath } from "next/cache";
import { parseCryptoImportFile } from "@/lib/crypto/import";
import { applyCryptoTransaction } from "@/lib/crypto/valuation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CryptoTransactionKind } from "@/types/database";

export type CryptoActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save"
  | "parse";

function revalidateCryptoPages() {
  revalidatePath("/fr/crypto");
  revalidatePath("/en/crypto");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("crypto_holdings") ||
    normalized.includes("crypto_transactions") ||
    normalized.includes("does not exist")
  );
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseKind(raw: string): CryptoTransactionKind | null {
  const kinds: CryptoTransactionKind[] = ["buy", "sell", "deposit", "withdrawal"];
  return kinds.includes(raw as CryptoTransactionKind)
    ? (raw as CryptoTransactionKind)
    : null;
}

export async function importCryptoFileAction(
  formData: FormData,
): Promise<{ error?: CryptoActionError; imported?: number }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "invalid" };
  }

  let rows;
  try {
    const content = await file.text();
    rows = parseCryptoImportFile(content);
  } catch {
    return { error: "parse" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  let imported = 0;

  for (const row of rows) {
    const { error } = await supabase.from("crypto_holdings").upsert(
      {
        user_id: user.id,
        name: row.name,
        xpub: row.xpub,
        symbol: row.symbol,
        quantity: row.quantity,
        cost_basis_eur: row.costBasisEur,
      },
      { onConflict: "user_id,name,xpub,symbol" },
    );

    if (error) {
      if (isSchemaError(error.message, error.code)) {
        return { error: "schema" };
      }
      return { error: "save" };
    }

    imported += 1;
  }

  revalidateCryptoPages();
  return { imported };
}

export async function createCryptoTransactionAction(
  formData: FormData,
): Promise<{ error?: CryptoActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const holdingId = String(formData.get("holdingId") ?? "").trim();
  const kind = parseKind(String(formData.get("kind") ?? ""));
  const quantity = parseAmount(String(formData.get("quantity") ?? ""));
  const amountEur = parseAmount(String(formData.get("amountEur") ?? ""));
  const transactionDate = String(formData.get("transactionDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!holdingId || !kind || quantity === null || amountEur === null || !transactionDate) {
    return { error: "invalid" };
  }

  if (quantity <= 0 || amountEur < 0) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: holding, error: holdingError } = await supabase
    .from("crypto_holdings")
    .select("id, quantity, cost_basis_eur")
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (holdingError) {
    if (isSchemaError(holdingError.message, holdingError.code)) {
      return { error: "schema" };
    }
    return { error: "save" };
  }

  if (!holding) {
    return { error: "invalid" };
  }

  const updated = applyCryptoTransaction(
    {
      quantity: Number(holding.quantity),
      cost_basis_eur: Number(holding.cost_basis_eur),
    },
    kind,
    quantity,
    amountEur,
  );

  const { error: txError } = await supabase.from("crypto_transactions").insert({
    user_id: user.id,
    holding_id: holdingId,
    kind,
    quantity,
    amount_eur: amountEur,
    transaction_date: transactionDate,
    note: note || null,
  });

  if (txError) {
    if (isSchemaError(txError.message, txError.code)) {
      return { error: "schema" };
    }
    return { error: "save" };
  }

  const { error: updateError } = await supabase
    .from("crypto_holdings")
    .update(updated)
    .eq("id", holdingId)
    .eq("user_id", user.id);

  if (updateError) {
    return { error: "save" };
  }

  revalidateCryptoPages();
  return {};
}

export async function deleteCryptoHoldingAction(
  formData: FormData,
): Promise<{ error?: CryptoActionError }> {
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
    .from("crypto_holdings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" };
    }
    return { error: "save" };
  }

  revalidateCryptoPages();
  return {};
}
