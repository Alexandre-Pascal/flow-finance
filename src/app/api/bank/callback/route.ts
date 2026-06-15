/**
 * @file route.ts
 * @description Callback OAuth Enable Banking — crée session et enregistre les comptes.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/enable-banking/client";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { syncUserTransactions } from "@/lib/enable-banking/sync";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("eb_oauth_state")?.value;

  if (
    !isEnableBankingConfigured() ||
    !code ||
    !state ||
    state !== savedState
  ) {
    return NextResponse.redirect(`${appUrl}/fr/accounts?error=auth`);
  }

  cookieStore.delete("eb_oauth_state");

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${appUrl}/fr/login`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${appUrl}/fr/login`);
  }

  try {
    const session = await createSession(code);

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 180);

    const { data: connection, error: connError } = await supabase
      .from("bank_connections")
      .insert({
        user_id: user.id,
        provider: "enable_banking",
        session_id: session.session_id,
        aspsp_name: process.env.ENABLE_BANKING_ASPSP_NAME,
        valid_until: validUntil.toISOString(),
        status: "active",
      })
      .select("id")
      .single();

    if (connError) throw connError;

    const accountRows = session.accounts.map((acc) => ({
      user_id: user.id,
      connection_id: connection.id,
      external_uid: acc.uid,
      name: acc.name ?? "Compte bancaire",
      iban: acc.account_id?.iban ?? null,
      type: "checking" as const,
      balance: 0,
      currency: acc.currency ?? "EUR",
    }));

    if (accountRows.length > 0) {
      const { error: accError } = await supabase.from("accounts").insert(accountRows);
      if (accError && accError.code !== "23505") throw accError;
    }

    await syncUserTransactions(user.id, "longest");

    return NextResponse.redirect(`${appUrl}/fr/accounts?connected=1`);
  } catch {
    return NextResponse.redirect(`${appUrl}/fr/accounts?error=sync`);
  }
}
