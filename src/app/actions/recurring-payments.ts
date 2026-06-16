"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  isGeneralRecurringClusterStillActive,
  isPayPalPattern,
} from "@/lib/finance/recurring-detection";
import {
  GENERAL_RECURRING_AMOUNT_TOLERANCE,
  generalRecurringMatchPattern,
} from "@/lib/finance/recurring-labels";
import {
  clusterDismissalKey,
  isPayPalClusterStillActive,
  mapRecurringPayment,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import { rematchRecurringPaymentsForUser } from "@/lib/finance/rematch-recurring-payments";
import { createClient } from "@/lib/supabase/server";

export type RecurringPaymentActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "inactive"
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
    normalized.includes("billing_month") ||
    normalized.includes("cadence") ||
    normalized.includes("recurring_suggestion_dismissals") ||
    normalized.includes("recurring_payment_manual") ||
    normalized.includes("does not exist")
  );
}

async function loadUserTransactionsForValidation(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
) {
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("user_id", userId);

  if (accountsError) throw accountsError;
  if (!accounts?.length) {
    return [];
  }

  const accountIds = accounts.map((account) => account.id);
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, account_id, amount, description, booking_date, recurring_payment_id")
    .in("account_id", accountIds)
    .lt("amount", 0);

  if (error) throw error;

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    account_id: String(row.account_id),
    amount: Number(row.amount),
    description: String(row.description),
    booking_date: String(row.booking_date),
    recurring_payment_id: row.recurring_payment_id ? String(row.recurring_payment_id) : null,
    account_name: String(accountById.get(row.account_id)?.name ?? ""),
  }));
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
  const billingMonthRaw = String(formData.get("billing_month") ?? "").trim();
  const billingMonth = billingMonthRaw ? Number(billingMonthRaw) : null;
  const cadence = String(formData.get("cadence") ?? "monthly") === "yearly" ? "yearly" : "monthly";
  const descriptionPatternRaw =
    String(formData.get("description_pattern") ?? "PAYPAL").trim() || "PAYPAL";
  const descriptionPattern = isPayPalPattern(descriptionPatternRaw)
    ? descriptionPatternRaw
    : generalRecurringMatchPattern(descriptionPatternRaw);
  const amountTolerance = isPayPalPattern(descriptionPatternRaw)
    ? 0.05
    : GENERAL_RECURRING_AMOUNT_TOLERANCE;

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  if (
    billingDay !== null &&
    (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31)
  ) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  if (
    cadence === "yearly" &&
    (billingMonth === null ||
      !Number.isInteger(billingMonth) ||
      billingMonth < 1 ||
      billingMonth > 12)
  ) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  if (billingDay !== null) {
    try {
      const [transactions, rules] = await Promise.all([
        loadUserTransactionsForValidation(supabase, user.id),
        getRecurringPaymentsForUser(user.id),
      ]);
      const stillActive = isPayPalPattern(descriptionPattern)
        ? isPayPalClusterStillActive(transactions, amount, billingDay, new Date(), rules)
        : isGeneralRecurringClusterStillActive(transactions, rules, {
            amount,
            billingDay,
            billingMonth: cadence === "yearly" ? billingMonth : null,
            cadence,
            descriptionPattern,
          });
      if (!stillActive) {
        return { error: "inactive" as const satisfies RecurringPaymentActionError };
      }
    } catch (validationError) {
      console.error("[createRecurringPayment] active check failed:", validationError);
      return { error: "save" as const satisfies RecurringPaymentActionError };
    }
  }

  const { error } = await supabase.from("recurring_payments").insert({
    user_id: user.id,
    name,
    amount,
    amount_tolerance: amountTolerance,
    billing_day: billingDay,
    billing_month: cadence === "yearly" ? billingMonth : null,
    cadence,
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

export async function updateRecurringPaymentCadenceAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const id = String(formData.get("id") ?? "");
  const cadence = String(formData.get("cadence") ?? "monthly") === "yearly" ? "yearly" : "monthly";

  if (!id) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  let billingMonth: number | null = null;
  if (cadence === "yearly") {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id);

    const accountIds = accounts?.map((account) => account.id) ?? [];
    if (accountIds.length > 0) {
      const { data: lastTx } = await supabase
        .from("transactions")
        .select("booking_date")
        .in("account_id", accountIds)
        .eq("recurring_payment_id", id)
        .lt("amount", 0)
        .order("booking_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastTx?.booking_date) {
        billingMonth = Number(String(lastTx.booking_date).slice(5, 7));
      }
    }
  }

  const { error } = await supabase
    .from("recurring_payments")
    .update({
      cadence,
      billing_month: cadence === "yearly" ? billingMonth : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateRecurringPaymentCadence] update failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  try {
    await rematchRecurringPaymentsForUser(user.id, supabase);
  } catch (rematchError) {
    console.error("[updateRecurringPaymentCadence] rematch failed:", rematchError);
    revalidateFinancePages();
    return { success: true as const, warning: "rematch" as const };
  }

  revalidateFinancePages();
  return { success: true as const };
}

function parseSuggestionFromFormData(formData: FormData): RecurringClusterSuggestion | null {
  const amount = Number(formData.get("amount"));
  const billingDay = Number(formData.get("billing_day"));
  const billingMonthRaw = String(formData.get("billing_month") ?? "").trim();
  const billingMonth = billingMonthRaw ? Number(billingMonthRaw) : null;
  const cadence = String(formData.get("cadence") ?? "monthly") === "yearly" ? "yearly" : "monthly";
  const descriptionPattern = String(formData.get("description_pattern") ?? "").trim();
  const source = String(formData.get("source") ?? "general") === "paypal" ? "paypal" : "general";
  const descriptionPreview = String(formData.get("description_preview") ?? descriptionPattern).trim();
  const lastDate = String(formData.get("last_date") ?? "").trim();
  const count = Number(formData.get("count"));

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(billingDay) ||
    billingDay < 1 ||
    billingDay > 31 ||
    !descriptionPattern
  ) {
    return null;
  }

  if (
    cadence === "yearly" &&
    (billingMonth === null ||
      !Number.isInteger(billingMonth) ||
      billingMonth < 1 ||
      billingMonth > 12)
  ) {
    return null;
  }

  return {
    amount,
    billingDay,
    billingMonth: cadence === "yearly" ? billingMonth : null,
    cadence,
    count: Number.isFinite(count) && count > 0 ? count : 1,
    lastDate: lastDate || "1970-01-01",
    descriptionPattern,
    descriptionPreview: descriptionPreview || descriptionPattern,
    source,
  };
}

export async function dismissRecurringSuggestionAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const suggestion = parseSuggestionFromFormData(formData);
  if (!suggestion) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  const clusterKey = clusterDismissalKey(suggestion);
  const { error } = await supabase.from("recurring_suggestion_dismissals").upsert(
    {
      user_id: user.id,
      cluster_key: clusterKey,
      source: suggestion.source,
      amount: suggestion.amount,
      billing_day: suggestion.billingDay,
      billing_month: suggestion.billingMonth,
      cadence: suggestion.cadence,
      description_pattern: suggestion.descriptionPattern,
    },
    { onConflict: "user_id,cluster_key" },
  );

  if (error) {
    console.error("[dismissRecurringSuggestion] upsert failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
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
