/**
 * @file client.ts
 * @description Client Supabase navigateur (composants client, auth côté client).
 */

import { createBrowserClient } from "@supabase/ssr";

/**
 * Indique si les variables Supabase sont configurées.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Crée un client Supabase pour le navigateur.
 * @throws Si les variables d'environnement Supabase sont absentes
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(url, key);
}
