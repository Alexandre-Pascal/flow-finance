"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { mapRecurringPayment } from "@/lib/finance/recurring-payments";
import { rematchRecurringPaymentsForUser } from "@/lib/finance/rematch-recurring-payments";
import { createClient } from "@/lib/supabase/server";

function revalidateFinancePages() {
  revalidatePath("/fr/settings");
  revalidatePath("/en/settings");
  revalidatePath("/fr/analytics");
  revalidatePath("/en/analytics");
  revalidatePath("/fr/transactions");
  revalidatePath("/en/transactions");
}

export async function createRecurringPaymentAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const };
  }

  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const descriptionPattern =
    String(formData.get("description_pattern") ?? "PAYPAL").trim() || "PAYPAL";

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    return { error: "invalid" as const };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const };
  }

  const { error } = await supabase.from("recurring_payments").insert({
    user_id: user.id,
    name,
    amount,
    description_pattern: descriptionPattern,
  });

  if (error) {
    return { error: "save" as const };
  }

  await rematchRecurringPaymentsForUser(user.id, supabase);
  revalidateFinancePages();

  return { success: true as const };
}

export async function deleteRecurringPaymentAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "invalid" as const };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const };
  }

  const { error: clearError } = await supabase
    .from("transactions")
    .update({ recurring_payment_id: null })
    .eq("recurring_payment_id", id);

  if (clearError) {
    return { error: "save" as const };
  }

  const { error } = await supabase
    .from("recurring_payments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: "save" as const };
  }

  await rematchRecurringPaymentsForUser(user.id, supabase);
  revalidateFinancePages();

  return { success: true as const };
}

export async function getRecurringPaymentsForUser(userId: string) {
  const supabase = await createClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("recurring_payments")
    .select("*")
    .eq("user_id", userId)
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) =>
    mapRecurringPayment(row as Record<string, unknown>),
  );
}
