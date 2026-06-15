/**
 * @file route.ts
 * @description Déclenche une synchronisation manuelle ou via cron Vercel.
 */

import { NextResponse } from "next/server";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { syncUserTransactions } from "@/lib/enable-banking/sync";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isEnableBankingConfigured()) {
    return NextResponse.json(
      { error: "Enable Banking is not configured." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let userId: string | undefined;

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
      const result = await syncUserTransactions(uid, "default", admin);
      total += result.synced;
    }

    return NextResponse.json({ synced: total, users: users.length });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  userId = user.id;
  const result = await syncUserTransactions(userId, "default");

  return NextResponse.json(result);
}
