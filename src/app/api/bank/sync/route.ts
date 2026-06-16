/**
 * @file route.ts
 * @description Déclenche une synchronisation manuelle ou via cron Vercel.
 */

import { NextResponse } from "next/server";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { syncUserFinanceData } from "@/lib/enable-banking/sync";
import { createClient } from "@/lib/supabase/server";

function getRedirectBase(request: Request): { origin: string; locale: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const referer = request.headers.get("referer") ?? "";
  const locale = referer.includes("/en/") ? "en" : "fr";
  return { origin: appUrl, locale };
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isEnableBankingConfigured()) {
    if (isCron) {
      return NextResponse.json(
        { error: "Enable Banking is not configured." },
        { status: 503 },
      );
    }
    const { origin, locale } = getRedirectBase(request);
    return NextResponse.redirect(`${origin}/${locale}/settings?error=sync`);
  }

  const supabase = await createClient();
  if (!supabase) {
    if (isCron) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
    }
    const { origin, locale } = getRedirectBase(request);
    return NextResponse.redirect(`${origin}/${locale}/settings?error=sync`);
  }

  if (isCron) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: connections } = await admin
      .from("bank_connections")
      .select("user_id")
      .eq("status", "active");

    const users = [...new Set(connections?.map((c) => c.user_id) ?? [])];
    let total = 0;

    for (const uid of users) {
      const result = await syncUserFinanceData(uid, "default", admin);
      total += result.synced;
    }

    return NextResponse.json({ synced: total, users: users.length });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { origin, locale } = getRedirectBase(request);

  if (!user) {
    return NextResponse.redirect(`${origin}/${locale}/login`);
  }

  try {
    const result = await syncUserFinanceData(user.id, "longest");
    return NextResponse.redirect(
      `${origin}/${locale}/settings?synced=${result.synced}`,
    );
  } catch {
    return NextResponse.redirect(`${origin}/${locale}/settings?error=sync`);
  }
}
