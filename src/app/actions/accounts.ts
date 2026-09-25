/**
 * @file accounts.ts
 * @description Actions serveur des comptes créés à la main : les pockets
 * Revolut et autres sous-comptes que la banque n'expose pas.
 */

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { getActiveSpace } from "@/lib/get-active-space";
import { createClient } from "@/lib/supabase/server";

export type AccountActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save";

const NAME_MAX_LENGTH = 60;
const KEYWORD_MIN_LENGTH = 3;

function revalidateAccountPages() {
  revalidatePath("/", "layout");
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("match_keywords") ||
    normalized.includes("base_balance") ||
    normalized.includes("space_id") ||
    normalized.includes("display_name") ||
    normalized.includes("does not exist")
  );
}

function parseAmount(raw: string): number {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/**
 * Crée un compte reconnu par un fragment de libellé. Les virements qui le
 * citent lui seront rattachés à la lecture suivante, et son solde s'en déduit.
 */
export async function createManualAccountAction(
  formData: FormData,
): Promise<{ error?: AccountActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  const keyword = String(formData.get("keyword") ?? "").trim();
  const baseBalance = parseAmount(String(formData.get("baseBalance") ?? "0"));
  const requestedSpace = String(formData.get("spaceId") ?? "").trim();

  if (!name || keyword.length < KEYWORD_MIN_LENGTH) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  let spaceId: string | null = null;
  if (requestedSpace && requestedSpace !== "auto") {
    const { data: space } = await supabase
      .from("spaces")
      .select("id")
      .eq("id", requestedSpace)
      .eq("user_id", user.id)
      .maybeSingle();
    spaceId = space ? requestedSpace : null;
  }
  if (!spaceId) {
    // À défaut, le compte naît dans l'espace où l'utilisateur travaille.
    spaceId = (await getActiveSpace())?.id ?? null;
  }

  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name,
    type: "checking",
    currency: "EUR",
    balance: baseBalance,
    base_balance: baseBalance,
    match_keywords: [keyword],
    space_id: spaceId,
  });

  if (error) {
    console.error("[createManualAccount] insert failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateAccountPages();
  return {};
}

/**
 * Supprime un compte créé à la main. Refuse de toucher à un compte bancaire :
 * celui-là appartient à la synchronisation, pas à l'utilisateur.
 */
export async function deleteManualAccountAction(
  formData: FormData,
): Promise<{ error?: AccountActionError }> {
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

  const { data: account, error: loadError } = await supabase
    .from("accounts")
    .select("id, external_uid")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError) {
    return isSchemaError(loadError.message, loadError.code)
      ? { error: "schema" }
      : { error: "save" };
  }
  if (!account || account.external_uid) {
    return { error: "invalid" };
  }

  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deleteManualAccount] delete failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateAccountPages();
  return {};
}

/**
 * Met à jour ce que l'utilisateur maîtrise sur un compte : son nom d'affichage
 * et les fragments de libellé qui le désignent dans un virement.
 *
 * Le nom donné par la banque n'est pas touché : c'est lui qui sert de repli
 * pour reconnaître un virement. Un nom vide lui rend la main.
 *
 * Les libellés, eux, tranchent là où le nom du titulaire ne suffit pas :
 * « From Alexandre P » désigne un compte Revolut, « M. PASCAL ALEXANDRE » un
 * compte Crédit Agricole, alors que les deux nomment la même personne.
 */
export async function updateAccountAction(
  formData: FormData,
): Promise<{ error?: AccountActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const raw = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  if (!id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const keywords = String(formData.get("keywords") ?? "")
    .split(/[\n;]+/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= KEYWORD_MIN_LENGTH);

  const { error } = await supabase
    .from("accounts")
    .update({ display_name: raw || null, match_keywords: keywords })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateAccount] update failed:", error);
    return isSchemaError(error.message, error.code)
      ? { error: "schema" }
      : { error: "save" };
  }

  revalidateAccountPages();
  return {};
}
