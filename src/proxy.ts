/**
 * @file proxy.ts
 * @description Proxy Next.js : i18n (next-intl) + rafraîchissement session Supabase.
 *
 * Depuis Next.js 16, le middleware s'appelle « proxy » et vit dans `proxy.ts`.
 */

import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { refreshSupabaseSession } from "./lib/supabase/proxy";

const intlMiddleware = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  await refreshSupabaseSession(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
