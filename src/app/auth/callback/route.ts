/**
 * @file route.ts
 * @description Callback OAuth Supabase après magic link.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/fr";

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(`${origin}/fr/login`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/fr/login`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/fr/login`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
