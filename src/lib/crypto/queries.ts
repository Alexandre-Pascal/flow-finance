/**
 * @file queries.ts
 * @description Chargement des données crypto depuis Supabase.
 */

import { fetchCryptoPricesEur } from "@/lib/crypto/prices";
import {
  buildCryptoHoldingViews,
  buildCryptoPortfolioSummary,
  mapCryptoHolding,
  mapCryptoPortfolioSettings,
  mapCryptoTransaction,
  type CryptoHoldingView,
  type CryptoPortfolioSummary,
} from "@/lib/crypto/valuation";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CryptoTransaction } from "@/types/database";

export interface CryptoPortfolioData {
  holdings: CryptoHoldingView[];
  transactions: CryptoTransaction[];
  summary: CryptoPortfolioSummary;
  totalInvestedEur: number;
  schemaReady: boolean;
  isDemo: boolean;
}

const EMPTY_SUMMARY: CryptoPortfolioSummary = {
  currentValueEur: 0,
  totalInvestedEur: 2163,
  latentGainEur: 0,
  flatTaxEur: 0,
  netIfSoldTodayEur: 0,
  holdingCount: 0,
  pricedCount: 0,
};

export async function getCryptoPortfolioData(): Promise<CryptoPortfolioData> {
  const user = await getAppUser();

  if (!user || user.isDemo) {
    return {
      holdings: [],
      transactions: [],
      summary: EMPTY_SUMMARY,
      totalInvestedEur: 2163,
      schemaReady: false,
      isDemo: true,
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      holdings: [],
      transactions: [],
      summary: EMPTY_SUMMARY,
      totalInvestedEur: 2163,
      schemaReady: false,
      isDemo: false,
    };
  }

  const { data: holdingRows, error: holdingsError } = await supabase
    .from("crypto_holdings")
    .select("*")
    .eq("user_id", user.id)
    .order("symbol", { ascending: true });

  const { data: transactionRows, error: transactionsError } = await supabase
    .from("crypto_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: false });

  const { data: settingsRow, error: settingsError } = await supabase
    .from("crypto_portfolio_settings")
    .select("total_invested_eur")
    .eq("user_id", user.id)
    .maybeSingle();

  const schemaReady = !holdingsError && !transactionsError && !settingsError;
  if (!schemaReady) {
    return {
      holdings: [],
      transactions: [],
      summary: EMPTY_SUMMARY,
      totalInvestedEur: 2163,
      schemaReady: false,
      isDemo: false,
    };
  }

  const { totalInvestedEur } = mapCryptoPortfolioSettings(
    settingsRow as Record<string, unknown> | null,
  );

  const holdings = (holdingRows ?? []).map((row) =>
    mapCryptoHolding(row as Record<string, unknown>),
  );
  const transactions = (transactionRows ?? []).map((row) =>
    mapCryptoTransaction(row as Record<string, unknown>),
  );

  let pricesEur: Record<string, number> = {};
  try {
    pricesEur = await fetchCryptoPricesEur(holdings.map((holding) => holding.symbol));
  } catch {
    pricesEur = {};
  }

  const views = buildCryptoHoldingViews(holdings, pricesEur);
  const summary = buildCryptoPortfolioSummary(views, totalInvestedEur);

  return {
    holdings: views,
    transactions,
    summary,
    totalInvestedEur,
    schemaReady: true,
    isDemo: false,
  };
}
