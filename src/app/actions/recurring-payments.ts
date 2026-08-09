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
  recurringGroupKey,
} from "@/lib/finance/recurring-labels";
import {
  clusterDismissalKey,
  DEFAULT_PAYPAL_PATTERN,
  getBookingDay,
  getBookingMonth,
  isPayPalClusterStillActive,
  mapRecurringPayment,
  parseRecurringCadence,
  resolveCanonicalRules,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import { rematchRecurringPaymentsForUser } from "@/lib/finance/rematch-recurring-payments";
import { createClient } from "@/lib/supabase/server";
import type { RecurringPayment } from "@/types/database";

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
  revalidatePath("/fr");
  revalidatePath("/en");
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
    normalized.includes("merged_into_id") ||
    normalized.includes("active_to") ||
    normalized.includes("amount_flexible") ||
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
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amountParsed = amountRaw === "" ? Number.NaN : Number(amountRaw);
  const billingDayRaw = String(formData.get("billing_day") ?? "").trim();
  const billingDay = billingDayRaw ? Number(billingDayRaw) : null;
  const billingMonthRaw = String(formData.get("billing_month") ?? "").trim();
  const billingMonth = billingMonthRaw ? Number(billingMonthRaw) : null;
  const cadence = parseRecurringCadence(formData.get("cadence"));
  const descriptionPatternRaw = String(formData.get("description_pattern") ?? "").trim();
  const descriptionPattern = isPayPalPattern(descriptionPatternRaw)
    ? descriptionPatternRaw
    : generalRecurringMatchPattern(descriptionPatternRaw);
  const amountTolerance = isPayPalPattern(descriptionPatternRaw)
    ? 0.05
    : GENERAL_RECURRING_AMOUNT_TOLERANCE;
  const amountFlexibleRaw = String(formData.get("amount_flexible") ?? "").trim();
  const amountFlexible =
    !isPayPalPattern(descriptionPatternRaw) &&
    (amountFlexibleRaw === "1" || amountFlexibleRaw === "true" || amountFlexibleRaw === "on");
  const amount =
    amountFlexible && !Number.isFinite(amountParsed) ? 0 : amountParsed;

  if (
    !name ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    (!amountFlexible && amount <= 0)
  ) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  if (!descriptionPattern || descriptionPattern.length < 2) {
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
            amountFlexible,
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
    amount_flexible: amountFlexible,
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
  const cadence = parseRecurringCadence(formData.get("cadence"));

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

async function loadOwnedTransaction(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  transactionId: string,
  userId: string,
) {
  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, account_id, amount, description, booking_date")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError) throw txError;
  if (!tx) return null;

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", tx.account_id)
    .maybeSingle();

  if (accountError) throw accountError;
  if (account?.user_id !== userId) return null;

  return {
    amount: Number(tx.amount),
    description: String(tx.description),
    booking_date: String(tx.booking_date),
  };
}

/**
 * Crée un abonnement depuis une seule transaction choisie à la main, ou rattache
 * son libellé à un abonnement existant. Contrairement au flux par suggestion,
 * aucune récurrence n'a besoin d'avoir été détectée au préalable.
 */
export async function createSubscriptionFromTransactionAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const attachToId = String(formData.get("attachToId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const cadence = parseRecurringCadence(formData.get("cadence"));
  const amountFlexibleRaw = String(formData.get("amount_flexible") ?? "").trim();
  const amountFlexibleRequested =
    amountFlexibleRaw === "1" ||
    amountFlexibleRaw === "true" ||
    amountFlexibleRaw === "on";

  if (!transactionId || (!attachToId && !name)) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  let tx: Awaited<ReturnType<typeof loadOwnedTransaction>>;
  let rules: Awaited<ReturnType<typeof getRecurringPaymentsForUser>>;
  try {
    [tx, rules] = await Promise.all([
      loadOwnedTransaction(supabase, transactionId, user.id),
      getRecurringPaymentsForUser(user.id),
    ]);
  } catch (loadError) {
    console.error("[createSubscriptionFromTransaction] load failed:", loadError);
    const message = loadError instanceof Error ? loadError.message : "";
    return isSchemaError(message)
      ? { error: "schema" as const satisfies RecurringPaymentActionError }
      : { error: "save" as const satisfies RecurringPaymentActionError };
  }

  if (!tx || tx.amount >= 0) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const amount = Math.round(Math.abs(tx.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const payPal = isPayPalPattern(tx.description);
  const amountFlexible = !payPal && amountFlexibleRequested;
  const descriptionPattern = payPal
    ? DEFAULT_PAYPAL_PATTERN
    : generalRecurringMatchPattern(recurringGroupKey(tx.description));

  if (!descriptionPattern) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  let mergedIntoId: string | null = null;
  let resolvedName = name;

  if (attachToId) {
    const target = resolveCanonicalRules(rules).get(attachToId);
    if (!target) {
      return { error: "invalid" as const satisfies RecurringPaymentActionError };
    }
    mergedIntoId = target.id;
    resolvedName = name || target.name;
  }

  const { error } = await supabase.from("recurring_payments").insert({
    user_id: user.id,
    name: resolvedName,
    amount,
    amount_tolerance: payPal ? 0.05 : GENERAL_RECURRING_AMOUNT_TOLERANCE,
    amount_flexible: amountFlexible,
    billing_day: getBookingDay(tx.booking_date),
    billing_month: cadence === "yearly" ? getBookingMonth(tx.booking_date) : null,
    cadence,
    description_pattern: descriptionPattern,
    merged_into_id: mergedIntoId,
  });

  if (error) {
    console.error("[createSubscriptionFromTransaction] insert failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  try {
    await rematchRecurringPaymentsForUser(user.id, supabase);
  } catch (rematchError) {
    console.error("[createSubscriptionFromTransaction] rematch failed:", rematchError);
    revalidateFinancePages();
    return {
      success: true as const,
      warning: "rematch" as const satisfies RecurringPaymentActionError,
    };
  }

  revalidateFinancePages();
  return { success: true as const };
}

/** Vérifie qu'attacher `ruleId` à `targetId` ne crée pas de boucle. */
function wouldCreateMergeCycle(
  rules: RecurringPayment[],
  ruleId: string,
  targetId: string,
): boolean {
  if (ruleId === targetId) {
    return true;
  }

  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const seen = new Set<string>([targetId]);
  let current = byId.get(targetId);

  while (current?.merged_into_id) {
    if (current.merged_into_id === ruleId) {
      return true;
    }
    if (seen.has(current.merged_into_id)) {
      return false;
    }
    seen.add(current.merged_into_id);
    current = byId.get(current.merged_into_id);
  }

  return false;
}

/**
 * Rattache une règle à un autre abonnement (même service, libellé différent),
 * ou la détache si `targetId` est vide.
 */
export async function mergeRecurringPaymentsAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const id = String(formData.get("id") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();

  if (!id) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  let mergedIntoId: string | null = null;

  if (targetId) {
    let rules: RecurringPayment[];
    try {
      rules = await getRecurringPaymentsForUser(user.id);
    } catch (loadError) {
      console.error("[mergeRecurringPayments] load failed:", loadError);
      return { error: "save" as const satisfies RecurringPaymentActionError };
    }

    if (!rules.some((rule) => rule.id === id)) {
      return { error: "invalid" as const satisfies RecurringPaymentActionError };
    }

    const target = resolveCanonicalRules(rules).get(targetId);
    if (!target || wouldCreateMergeCycle(rules, id, target.id)) {
      return { error: "invalid" as const satisfies RecurringPaymentActionError };
    }

    mergedIntoId = target.id;
  }

  const { error } = await supabase
    .from("recurring_payments")
    .update({ merged_into_id: mergedIntoId })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[mergeRecurringPayments] update failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  revalidateFinancePages();
  return { success: true as const };
}

/**
 * Fige une règle à la date de son dernier paiement : elle garde son historique
 * mais ne capte plus les transactions suivantes. `restore` annule l'archivage.
 */
export async function archiveRecurringPaymentAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies RecurringPaymentActionError };
  }

  const id = String(formData.get("id") ?? "").trim();
  const restore = String(formData.get("restore") ?? "") === "1";

  if (!id) {
    return { error: "invalid" as const satisfies RecurringPaymentActionError };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies RecurringPaymentActionError };
  }

  let activeTo: string | null = null;

  if (!restore) {
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
        activeTo = String(lastTx.booking_date);
      }
    }

    activeTo = activeTo ?? new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from("recurring_payments")
    .update({ active_to: activeTo })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[archiveRecurringPayment] update failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies RecurringPaymentActionError };
    }
    return { error: "save" as const satisfies RecurringPaymentActionError };
  }

  try {
    await rematchRecurringPaymentsForUser(user.id, supabase);
  } catch (rematchError) {
    console.error("[archiveRecurringPayment] rematch failed:", rematchError);
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
  const cadence = parseRecurringCadence(formData.get("cadence"));
  const descriptionPattern = String(formData.get("description_pattern") ?? "").trim();
  const source = String(formData.get("source") ?? "general") === "paypal" ? "paypal" : "general";
  const descriptionPreview = String(formData.get("description_preview") ?? descriptionPattern).trim();
  const lastDate = String(formData.get("last_date") ?? "").trim();
  const count = Number(formData.get("count"));
  const amountFlexibleRaw = String(formData.get("amount_flexible") ?? "").trim();
  const amountFlexible =
    amountFlexibleRaw === "1" ||
    amountFlexibleRaw === "true" ||
    amountFlexibleRaw === "on";

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
    amountFlexible,
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
