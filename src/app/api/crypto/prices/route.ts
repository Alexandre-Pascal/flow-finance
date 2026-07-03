/**
 * @file route.ts
 * @description Rafraîchit les cours crypto EUR (CoinGecko).
 */

import { NextResponse } from "next/server";
import { fetchCryptoPricesEur } from "@/lib/crypto/prices";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: holdings, error } = await supabase
    .from("crypto_holdings")
    .select("symbol")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const symbols = (holdings ?? []).map((row) => String(row.symbol));

  try {
    const prices = await fetchCryptoPricesEur(symbols);
    return NextResponse.json({ prices, updatedAt: new Date().toISOString() });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Price fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
