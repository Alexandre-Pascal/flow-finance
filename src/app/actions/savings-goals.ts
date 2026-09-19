/**
 * @file savings-goals.ts
 * @description Actions serveur des objectifs d'épargne : CRUD des objectifs et
 * affectation d'un montant fixe par livret.
 */

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  isValidHexColor,
  normalizeColor,
} from "@/lib/finance/expense-categories";
import { createClient } from "@/lib/supabase/server";

export type SavingsGoalActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save";

function revalidateGoalPages() {
  revalidatePath("/fr/goals");
  revalidatePath("/en/goals");
  revalidatePath("/fr/savings");
  revalidatePath("/en/savings");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("savings_goals") ||
    normalized.includes("savings_goal_allocations") ||
    normalized.includes("does not exist")
  );
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function parseDate(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function buildGoalPayload(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = parseAmount(String(formData.get("targetAmount") ?? ""));
  const targetDateRaw = String(formData.get("targetDate") ?? "").trim();
  const requestedColor = String(formData.get("color") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!name || targetAmount === null || targetAmount <= 0) {
    return null;
  }
  if (targetDateRaw && !parseDate(targetDateRaw)) {
    return null;
  }
  if (requestedColor && !isValidHexColor(requestedColor)) {
    return null;
  }

  return {
    name,
    target_amount: targetAmount,
    target_date: targetDateRaw ? parseDate(targetDateRaw) : null,
    color: requestedColor ? normalizeColor(requestedColor) : "#CA8A04",
    note: note || null,
  };
}

export async function createSavingsGoalAction(
  formData: FormData,
): Promise<{ error?: SavingsGoalActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const payload = buildGoalPayload(formData);
  if (!payload) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  // Le nouvel objectif se place en fin de liste.
  const { data: last } = await supabase
    .from("savings_goals")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("savings_goals").insert({
    user_id: user.id,
    position: Number(last?.position ?? 0) + 1,
    ...payload,
  });

  if (error) {
    console.error("[createSavingsGoal] insert failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateGoalPages();
  return {};
}

export async function updateSavingsGoalAction(
  formData: FormData,
): Promise<{ error?: SavingsGoalActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const payload = buildGoalPayload(formData);
  if (!id || !payload) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("savings_goals")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateSavingsGoal] update failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateGoalPages();
  return {};
}

export async function deleteSavingsGoalAction(
  formData: FormData,
): Promise<{ error?: SavingsGoalActionError }> {
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

  // Les affectations partent avec l'objectif (on delete cascade).
  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deleteSavingsGoal] delete failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateGoalPages();
  return {};
}

/**
 * Fixe la part d'un livret affectée à un objectif.
 * Un montant nul (ou négatif) supprime l'affectation.
 */
export async function setSavingsGoalAllocationAction(
  formData: FormData,
): Promise<{ error?: SavingsGoalActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const goalId = String(formData.get("goalId") ?? "").trim();
  const savingsAccountId = String(
    formData.get("savingsAccountId") ?? "",
  ).trim();
  const amount = parseAmount(String(formData.get("amount") ?? ""));

  if (!goalId || !savingsAccountId || amount === null) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  // Les deux bouts de l'affectation doivent appartenir à l'utilisateur.
  const [{ data: goal, error: goalError }, { data: account, error: accountError }] =
    await Promise.all([
      supabase
        .from("savings_goals")
        .select("id")
        .eq("id", goalId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("savings_accounts")
        .select("id")
        .eq("id", savingsAccountId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (goalError || accountError) {
    const failure = goalError ?? accountError;
    console.error("[setSavingsGoalAllocation] load failed:", failure);
    return isSchemaError(failure?.message ?? "", failure?.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  if (!goal || !account) {
    return { error: "invalid" };
  }

  if (amount <= 0) {
    const { error } = await supabase
      .from("savings_goal_allocations")
      .delete()
      .eq("goal_id", goalId)
      .eq("savings_account_id", savingsAccountId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[setSavingsGoalAllocation] delete failed:", error);
      return isSchemaError(error.message, error.code)
        ? { error: "schema" }
        : { error: "save" };
    }

    revalidateGoalPages();
    return {};
  }

  const { error } = await supabase.from("savings_goal_allocations").upsert(
    {
      user_id: user.id,
      goal_id: goalId,
      savings_account_id: savingsAccountId,
      amount,
    },
    { onConflict: "goal_id,savings_account_id" },
  );

  if (error) {
    console.error("[setSavingsGoalAllocation] upsert failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateGoalPages();
  return {};
}
