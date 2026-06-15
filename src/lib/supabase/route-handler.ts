/**
 * @file route-handler.ts
 * @description Client Supabase pour Route Handlers — lie les cookies à la NextResponse.
 */

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Crée un client Supabase dont les mises à jour de session sont écrites sur la réponse HTTP.
 * Requis pour exchangeCodeForSession et signOut (sinon les cookies ne sont pas persistés).
 */
export function createRouteHandlerClient(
  request: NextRequest,
  response: NextResponse,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createServerClient(url, key, {
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
}
