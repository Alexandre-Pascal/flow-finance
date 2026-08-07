/**
 * @file proxy.ts
 * @description Rafraîchissement de session Supabase dans le proxy Next.js.
 */

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Rafraîchit le token de session et écrit les cookies sur la réponse fournie.
 *
 * `getClaims()` remplace ici `getUser()` : il rafraîchit la session quand le
 * token approche de son expiration, mais valide le JWT localement (WebCrypto)
 * au lieu d'appeler le serveur Auth à chaque navigation. Ce trajet réseau
 * représentait 86 à 230 ms sur chaque requête.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getClaims();
}
