/**
 * @file admin.ts
 * @description Client Supabase service role (cron, tâches serveur sans session user).
 * Ne jamais exposer côté client.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Crée un client admin bypass RLS. Requiert SUPABASE_SERVICE_ROLE_KEY.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin credentials are not configured.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
