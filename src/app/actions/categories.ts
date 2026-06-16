"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  isValidHexColor,
  mapCategory,
  mergeCategoryLearning,
  normalizeColor,
  pickAvailableColor,
  syncDefaultCategories,
} from "@/lib/finance/expense-categories";
import { rematchCategoriesForUser } from "@/lib/finance/rematch-categories";
import { createClient } from "@/lib/supabase/server";

export type CategoryActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save"
  | "rematch"
  | "colorTaken"
  | "nameTaken";

function revalidateFinancePages() {
  revalidatePath("/fr/settings");
  revalidatePath("/en/settings");
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
    normalized.includes("categories") ||
    normalized.includes("category_manual") ||
    normalized.includes("does not exist")
  );
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((keyword) => keyword.trim().toUpperCase())
    .filter((keyword) => keyword.length >= 2);
}

export async function createCategoryAction(
  formData: FormData,
): Promise<{ error?: CategoryActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  const requestedColor = String(formData.get("color") ?? "").trim();

  if (!name) {
    return { error: "invalid" };
  }

  if (requestedColor && !isValidHexColor(requestedColor)) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { categories: existingCategories } = await syncDefaultCategories(
    supabase,
    user.id,
  );

  const usedColors = existingCategories.map((category) => category.color);

  if (
    existingCategories.some(
      (category) => category.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    return { error: "nameTaken" };
  }

  const color = requestedColor
    ? normalizeColor(requestedColor)
    : pickAvailableColor(usedColors);

  if (
    usedColors.some((used) => normalizeColor(used) === normalizeColor(color))
  ) {
    return { error: "colorTaken" };
  }

  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name,
    color,
    keyword_rules: keywords,
  });

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  try {
    await rematchCategoriesForUser(user.id, supabase);
  } catch {
    return { error: "rematch" };
  }

  revalidateFinancePages();
  return {};
}

export async function updateCategoryAction(
  formData: FormData,
): Promise<{ error?: CategoryActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const color = normalizeColor(String(formData.get("color") ?? ""));
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));

  if (!id || !name || !isValidHexColor(color)) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: categoryRows, error: loadError } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id);

  if (loadError) {
    return isSchemaError(loadError.message, loadError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  const categories = (categoryRows ?? []).map((row) =>
    mapCategory(row as Record<string, unknown>),
  );

  if (!categories.some((category) => category.id === id)) {
    return { error: "invalid" };
  }

  const nameTaken = categories.some(
    (category) =>
      category.id !== id &&
      category.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (nameTaken) {
    return { error: "nameTaken" };
  }

  const colorTaken = categories.some(
    (category) =>
      category.id !== id && normalizeColor(category.color) === color,
  );
  if (colorTaken) {
    return { error: "colorTaken" };
  }

  const { error } = await supabase
    .from("categories")
    .update({ name, color, keyword_rules: keywords })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  try {
    await rematchCategoriesForUser(user.id, supabase);
  } catch {
    return { error: "rematch" };
  }

  revalidateFinancePages();
  return {};
}

export async function deleteCategoryAction(
  formData: FormData,
): Promise<{ error?: CategoryActionError }> {
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

  const { error: clearError } = await supabase
    .from("transactions")
    .update({ category_id: null, category_manual: false })
    .eq("category_id", id);

  if (clearError) {
    return isSchemaError(clearError.message, clearError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateFinancePages();
  return {};
}

export async function assignTransactionCategoryAction(
  formData: FormData,
): Promise<{ error?: CategoryActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const categoryIdRaw = String(formData.get("categoryId") ?? "").trim();
  const categoryId = categoryIdRaw === "none" || !categoryIdRaw ? null : categoryIdRaw;

  if (!transactionId) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, amount, description, account_id")
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
    .update({
      category_id: categoryId,
      category_manual: true,
    })
    .eq("id", transactionId);

  if (updateError) {
    return isSchemaError(updateError.message, updateError.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  if (categoryId) {
    const { data: categoryRow, error: categoryError } = await supabase
      .from("categories")
      .select("*")
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (categoryError) {
      return isSchemaError(categoryError.message, categoryError.code)
        ? { error: "schema" }
        : { error: "save" };
    }

    if (categoryRow) {
      const category = mapCategory(categoryRow as Record<string, unknown>);
      const learned = mergeCategoryLearning(category, String(tx.description));

      const { error: learnError } = await supabase
        .from("categories")
        .update(learned)
        .eq("id", categoryId);

      if (learnError) {
        return isSchemaError(learnError.message, learnError.code)
          ? { error: "schema" }
          : { error: "save" };
      }
    }
  }

  revalidateFinancePages();
  return {};
}

export async function rematchCategoriesAction(): Promise<{
  error?: CategoryActionError;
  matched?: number;
}> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  try {
    const { matched } = await rematchCategoriesForUser(user.id, supabase);
    revalidateFinancePages();
    return { matched };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isSchemaError(message) ? { error: "schema" } : { error: "rematch" };
  }
}
