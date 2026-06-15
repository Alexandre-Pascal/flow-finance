/**
 * @file route.ts
 * @description Callback OAuth Supabase après connexion Google.
 */

import { NextResponse, type NextRequest } from "next/server";
import { AUTH_REDIRECT_COOKIE } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

function getRedirectPath(request: NextRequest): string {
  const fromCookie = request.cookies.get(AUTH_REDIRECT_COOKIE)?.value;
  if (fromCookie) {
    try {
      return decodeURIComponent(fromCookie);
    } catch {
      return "/fr";
    }
  }
  return "/fr";
}

function loginPath(redirectPath: string): string {
  const locale = redirectPath.startsWith("/en") ? "en" : "fr";
  return `/${locale}/login`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const redirectPath = getRedirectPath(request);
  const loginUrl = `${origin}${loginPath(redirectPath)}`;

  if (oauthError || !isSupabaseConfigured() || !code) {
    return NextResponse.redirect(`${loginUrl}?error=auth`);
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);
  response.cookies.delete(AUTH_REDIRECT_COOKIE);

  const supabase = createRouteHandlerClient(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${loginUrl}?error=auth`);
  }

  return response;
}
