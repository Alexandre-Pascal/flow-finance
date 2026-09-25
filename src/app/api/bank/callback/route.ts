/**
 * @file route.ts
 * @description Callback OAuth Enable Banking — crée session et enregistre les comptes.
 */

import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, fetchBalances } from "@/lib/enable-banking/client";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { syncUserFinanceData } from "@/lib/enable-banking/sync";
import { pickAccountBalance } from "@/lib/enable-banking/types";
import { ensureDefaultSpaceId } from "@/lib/finance/spaces";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("eb_oauth_state")?.value;
  const savedAspspName = cookieStore.get("eb_oauth_aspsp")?.value;

  if (
    !isEnableBankingConfigured() ||
    !code ||
    !state ||
    state !== savedState
  ) {
    return NextResponse.redirect(`${appUrl}/fr/settings?error=auth`);
  }

  cookieStore.delete("eb_oauth_state");
  cookieStore.delete("eb_oauth_aspsp");

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
        aspsp_name:
          savedAspspName ?? process.env.ENABLE_BANKING_ASPSP_NAME ?? null,
        valid_until: validUntil.toISOString(),
        status: "active",
      })
      .select("id")
      .single();

    if (connError) throw connError;

    if (session.accounts.length === 0) {
      // Consentement accordé mais aucun compte partagé : garder la connexion
      // laisserait une banque « reliée » sans rien derrière, dans la liste des
      // Paramètres comme dans les relances de synchronisation.
      await supabase.from("bank_connections").delete().eq("id", connection.id);
      return NextResponse.redirect(`${appUrl}/fr/settings?error=no_accounts`);
    }

    // Un compte qui arriverait sans espace deviendrait invisible dès que le
    // filtrage par espace sera en place.
    const spaceId = await ensureDefaultSpaceId(supabase, user.id);

    const accountRows = await Promise.all(
      session.accounts.map(async (acc) => {
        let balance = 0;
        try {
          const { balances } = await fetchBalances(acc.uid);
          balance = pickAccountBalance(balances);
        } catch {
          balance = 0;
        }

        return {
          user_id: user.id,
          connection_id: connection.id,
          space_id: spaceId,
          external_uid: acc.uid,
          name: acc.name ?? "Compte bancaire",
          iban: acc.account_id?.iban ?? null,
          type: "checking" as const,
          balance,
          currency: acc.currency ?? "EUR",
        };
      }),
    );

    if (accountRows.length > 0) {
      const { error: accError } = await supabase.from("accounts").insert(accountRows);
      if (accError && accError.code !== "23505") throw accError;
    }

    // Ne pas bloquer le redirect OAuth sur la sync complète (peut prendre des minutes).
    const userId = user.id;
    after(async () => {
      try {
        await syncUserFinanceData(userId, "longest");
      } catch (error) {
        console.error("[bank/callback] background sync failed", error);
      }
    });

    return NextResponse.redirect(`${appUrl}/fr/settings?connected=1`);
  } catch {
    return NextResponse.redirect(`${appUrl}/fr/settings?error=sync`);
  }
}
