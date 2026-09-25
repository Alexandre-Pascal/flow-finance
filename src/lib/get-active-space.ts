/**
 * @file get-active-space.ts
 * @description Espace courant, lu une fois par requête. Il vit dans un cookie
 * plutôt que dans l'URL : aucune page du dashboard ne lit `searchParams`, et
 * les resignaturer toutes coûterait cher pour une préférence d'affichage.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { getAppUser } from "@/lib/auth";
import { defaultSpace, mapSpace } from "@/lib/finance/spaces";
import { createClient } from "@/lib/supabase/server";
import type { Space } from "@/types/database";

export const ACTIVE_SPACE_COOKIE = "ff_space";

export const getSpaces = cache(async function getSpaces(): Promise<Space[]> {
  const user = await getAppUser();
  if (!user || user.isDemo) {
    return [];
  }

  const supabase = await createClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) {
    console.error("[getSpaces] load failed:", error);
    return [];
  }

  return (data ?? []).map((row) => mapSpace(row));
});

/**
 * Espace sélectionné, ou l'espace personnel à défaut.
 *
 * Un cookie périmé — espace supprimé, autre compte — ne doit jamais vider
 * l'application en silence : on retombe sur l'espace par défaut.
 */
export const getActiveSpace = cache(async function getActiveSpace(): Promise<Space | null> {
  const spaces = await getSpaces();
  if (spaces.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_SPACE_COOKIE)?.value;

  return spaces.find((space) => space.id === wanted) ?? defaultSpace(spaces);
});
