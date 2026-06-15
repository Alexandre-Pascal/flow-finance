/**
 * @file auth.ts
 * @description Helpers d'authentification serveur (session Supabase ou mode démo).
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export interface AppUser {
  id: string;
  email: string;
  isDemo: boolean;
}

/**
 * Récupère l'utilisateur courant ou un utilisateur démo si Supabase est absent.
 */
export async function getAppUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) {
    return {
      id: "demo-user",
      email: "demo@flow-finance.local",
      isDemo: true,
    };
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  return {
    id: user.id,
    email: user.email,
    isDemo: false,
  };
}

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
