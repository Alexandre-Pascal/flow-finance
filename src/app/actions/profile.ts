"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  normalizeProfileSettings,
  type ProfileSettings,
} from "@/lib/profile-settings";
import { createClient } from "@/lib/supabase/server";

export type ProfileSettingsActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save";

function revalidateSettingsPages() {
  revalidatePath("/fr/settings");
  revalidatePath("/en/settings");
  revalidatePath("/fr");
  revalidatePath("/en");
  revalidatePath("/fr/analytics");
  revalidatePath("/en/analytics");
  revalidatePath("/fr/savings");
  revalidatePath("/en/savings");
  revalidatePath("/fr/investments");
  revalidatePath("/en/investments");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("settings") ||
    normalized.includes("does not exist")
  );
}

function parseSettingsFromFormData(formData: FormData): ProfileSettings {
  let trackedOutgoingPeople: unknown = [];
  const rawPeople = String(formData.get("tracked_outgoing_people") ?? "").trim();
  if (rawPeople) {
    try {
      trackedOutgoingPeople = JSON.parse(rawPeople);
    } catch {
      trackedOutgoingPeople = [];
    }
  }

  return normalizeProfileSettings({
    modules: {
      savings: formData.get("module_savings") === "1",
      investments: formData.get("module_investments") === "1",
      payroll: formData.get("module_payroll") === "1",
      trackedPerson: formData.get("module_tracked_person") === "1",
      trackedOutgoing: formData.get("module_tracked_outgoing") === "1",
    },
    payroll: {
      keyword: String(formData.get("payroll_keyword") ?? ""),
      budgetShiftMonths: String(formData.get("payroll_shift") ?? "1") === "0" ? 0 : 1,
    },
    trackedPerson: {
      keyword: String(formData.get("tracked_person_keyword") ?? ""),
      label: String(formData.get("tracked_person_label") ?? ""),
    },
    trackedOutgoingPeople,
  });
}

export async function updateProfileSettingsAction(formData: FormData) {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" as const satisfies ProfileSettingsActionError };
  }

  const settings = parseSettingsFromFormData(formData);

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" as const satisfies ProfileSettingsActionError };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("[updateProfileSettings] update failed:", error);
    if (isSchemaError(error.message, error.code)) {
      return { error: "schema" as const satisfies ProfileSettingsActionError };
    }
    return { error: "save" as const satisfies ProfileSettingsActionError };
  }

  revalidateSettingsPages();
  return { success: true as const };
}
