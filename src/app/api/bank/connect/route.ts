/**
 * @file route.ts
 * @description Démarre le flux OAuth Enable Banking et redirige vers la banque.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveConnectAspsp } from "@/lib/enable-banking/aspsps";
import { startAuthorization } from "@/lib/enable-banking/client";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isEnableBankingConfigured()) {
    return NextResponse.json(
      { error: "Enable Banking is not configured." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const aspsp = resolveConnectAspsp(searchParams.get("aspsp"));

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("eb_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("eb_oauth_aspsp", aspsp.name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 180);

  const auth = await startAuthorization({
    aspsp: {
      name: aspsp.name,
      country: aspsp.country,
    },
    redirectUrl: process.env.ENABLE_BANKING_REDIRECT_URL!,
    state,
    validUntil: validUntil.toISOString(),
  });

  return NextResponse.redirect(auth.url);
}
