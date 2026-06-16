"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { mapRecurringPayment } from "@/lib/finance/recurring-payments";
import { rematchRecurringPaymentsForUser } from "@/lib/finance/rematch-recurring-payments";
import { createClient } from "@/lib/supabase/server";

export type RecurringPaymentActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save"
  | "rematch";

function revalidateFinancePages() {
  revalidatePath("/fr/settings");
  revalidatePath("/en/settings");
  revalidatePath("/fr/analytics");
  revalidatePath("/en/analytics");
  revalidatePath("/fr/transactions");
  revalidatePath("/en/transactions");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("recurring_payments") ||
    normalized.includes("billing_day") ||
    normalized.includes("recurring_payment_manual") ||
    normalized.includes("does not exist")
  );
}

export async function createRecurringPaymentAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const billingDayRaw = String(formData.get("billing_day") ?? "").trim();
  const billingDay = billingDayRaw ? Number(billingDayRaw) : null;
  const descriptionPattern =
    String(formData.get("description_pattern") ?? "PAYPAL").trim() || "PAYPAL";

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  if (
    billingDay !== null &&
    (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31)
  ) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  const { error } = await supabase.from("recurring_payments").insert({
    user_id: user.id,
    name,
    amount,
    billing_day: billingDay,
    description_pattern: descriptionPattern,
  });

  if (error) {
    console.error("[createRecurringPayment] insert failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  try {
    await rematchRecurringPaymentsForUser(user.id, supabase);
  } catch (rematchError) {
    console.error("[createRecurringPayment] rematch failed:", rematchError);
    revalidateFinancePages();
    return {
      success: true as const,
      warning: "rematch" as const satisfies RecurringPaymentActionError,
    };
  }

  revalidateFinancePages();

  return { success: true as const };
}

export async function deleteRecurringPaymentAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  const { error: clearError } = await supabase
    .from("transactions")
    .update({ recurring_payment_id: null, recurring_payment_manual: false })
    .eq("recurring_payment_id", id);

  if (clearError) {
    console.error("[deleteRecurringPayment] clear failed:", clearError);
    if (isSchemaError(clearError.message, clearError.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  const { error } = await supabase
    .from("recurring_payments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deleteRecurringPayment] delete failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  try {
    await rematchRecurringPaymentsForUser(user.id, supabase);
  } catch (rematchError) {
    console.error("[deleteRecurringPayment] rematch failed:", rematchError);
    revalidateFinancePages();
    return { success: true as const, warning: "rematch" as const };
  }

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
