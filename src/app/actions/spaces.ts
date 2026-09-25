/**
 * @file spaces.ts
 * @description Actions serveur des espaces : créer, renommer, supprimer, et
 * affecter un compte à un espace.
 */

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { parseSpaceKind } from "@/lib/finance/spaces";
import { createClient } from "@/lib/supabase/server";

export type SpaceActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save";

const NAME_MAX_LENGTH = 40;

function revalidateSpacePages() {
  revalidatePath("/fr/settings", "layout");
  revalidatePath("/en/settings", "layout");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("spaces") ||
    normalized.includes("space_id") ||
    normalized.includes("does not exist")
  );
}

export async function createSpaceAction(
  formData: FormData,
): Promise<{ error?: SpaceActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  const kind = parseSpaceKind(formData.get("kind"));
  if (!name) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  // Le nouvel espace se range après les autres.
  const { data: last } = await supabase
    .from("spaces")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("spaces").insert({
    user_id: user.id,
    name,
    kind,
    position: Number(last?.position ?? 0) + 1,
  });

  if (error) {
    console.error("[createSpace] insert failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSpacePages();
  return {};
}

export async function renameSpaceAction(
  formData: FormData,
): Promise<{ error?: SpaceActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  if (!id || !name) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("spaces")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[renameSpace] update failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSpacePages();
  return {};
}

/**
 * Supprime un espace. Ses comptes ne disparaissent pas : leur `space_id` est
 * remis à `null`, ce qui les fait retomber dans l'espace personnel.
 */
export async function deleteSpaceAction(
  formData: FormData,
): Promise<{ error?: SpaceActionError }> {
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
    .from("spaces")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deleteSpace] delete failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSpacePages();
  return {};
}

/** Affecte un compte à un espace ; « auto » le laisse dans l'espace personnel. */
export async function assignAccountSpaceAction(
  formData: FormData,
): Promise<{ error?: SpaceActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  const raw = String(formData.get("spaceId") ?? "").trim();
  if (!accountId) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  let spaceId: string | null = null;

  if (raw && raw !== "auto") {
    const { data: space, error: spaceError } = await supabase
      .from("spaces")
      .select("id")
      .eq("id", raw)
      .eq("user_id", user.id)
      .maybeSingle();

    if (spaceError) {
      return isSchemaError(spaceError.message, spaceError.code)
        ? { error: "schema" }
        : { error: "save" };
    }
    if (!space) {
      return { error: "invalid" };
    }
    spaceId = raw;
  }

  const { error } = await supabase
    .from("accounts")
    .update({ space_id: spaceId })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[assignAccountSpace] update failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateSpacePages();
  return {};
}
