/**
 * @file spaces.ts
 * @description Espaces : regroupements de comptes séparant un budget perso d'un
 * budget partagé. Un compte sans espace est traité comme personnel, ce qui
 * permet d'ajouter la notion sans rien casser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, Space, SpaceKind } from "@/types/database";

export const DEFAULT_SPACE_NAME = "Perso";

export function mapSpace(row: Record<string, unknown>): Space {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    kind: row.kind === "shared" ? "shared" : "personal",
    color: String(row.color ?? "#0F172A"),
    position: Number(row.position ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function parseSpaceKind(value: unknown): SpaceKind {
  return value === "shared" ? "shared" : "personal";
}

/**
 * Espace par défaut : le premier espace personnel, sinon le premier tout court.
 * C'est lui qui accueille les comptes nouvellement synchronisés.
 */
export function defaultSpace(spaces: Space[]): Space | null {
  const sorted = [...spaces].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  return sorted.find((space) => space.kind === "personal") ?? sorted[0] ?? null;
}

/** L'espace d'un compte, en tenant compte du repli sur l'espace personnel. */
export function accountSpaceId(
  account: { space_id?: string | null },
  spaces: Space[],
): string | null {
  return account.space_id ?? defaultSpace(spaces)?.id ?? null;
}

/**
 * Identifiant de l'espace d'accueil des nouveaux comptes, créé si besoin.
 * Appelé à la connexion d'une banque : un compte qui arrive sans espace
 * deviendrait invisible dès que le filtrage sera en place.
 */
export async function ensureDefaultSpaceId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[ensureDefaultSpace] load failed:", error);
    return null;
  }

  const existing = defaultSpace((data ?? []).map((row) => mapSpace(row)));
  if (existing) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("spaces")
    .insert({ user_id: userId, name: DEFAULT_SPACE_NAME, kind: "personal" })
    .select("id")
    .single();

  if (createError) {
    console.error("[ensureDefaultSpace] create failed:", createError);
    return null;
  }

  return String(created.id);
}

/** Nom à afficher pour un compte : celui de l'utilisateur, sinon la banque. */
export function accountLabel(
  account: Pick<Account, "name" | "display_name">,
): string {
  return account.display_name?.trim() || account.name;
}
