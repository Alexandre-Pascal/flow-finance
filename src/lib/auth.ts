/**
 * @file auth.ts
 * @description Helpers d'authentification serveur (session Supabase ou mode démo).
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export interface AppUser {
  id: string;
  email: string;
  isDemo: boolean;
}

/**
 * Récupère l'utilisateur courant ou un utilisateur démo si Supabase est absent.
 *
 * Mémoïsé par `cache()` : le layout, la page et les helpers de données d'une
 * même requête ne déclenchent qu'une seule vérification de session.
 *
 * `getClaims()` valide le JWT localement via WebCrypto quand le projet utilise
 * des clés de signature asymétriques, et ne retombe sur un appel réseau au
 * serveur Auth que si le projet signe encore avec un secret symétrique.
 */
export const getAppUser = cache(async function getAppUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) {
    return {
      id: "demo-user",
      email: "demo@flow-finance.local",
      isDemo: true,
    };
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;

  const email = typeof claims.email === "string" ? claims.email : null;
  if (!email) return null;

  return {
    id: claims.sub,
    email,
    isDemo: false,
  };
});

/**
 * Indique si l'utilisateur doit être redirigé vers la page de connexion.
 */
export async function requireAuth(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
