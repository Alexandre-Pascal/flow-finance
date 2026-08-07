/**
 * @file route.ts
 * @description Rafraîchit les cours EUR des lignes du PEA (Yahoo Finance).
 */

import { NextResponse } from "next/server";
import { fetchQuotesEur } from "@/lib/market/prices";
import { resolveTicker } from "@/lib/market/tickers";
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
    .from("pea_holdings")
    .select("isin, ticker")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tickers = (holdings ?? []).map((row) =>
    resolveTicker(String(row.isin), row.ticker ? String(row.ticker) : null),
  );

  try {
    const prices = await fetchQuotesEur(tickers);
    return NextResponse.json({ prices, updatedAt: new Date().toISOString() });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Price fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
