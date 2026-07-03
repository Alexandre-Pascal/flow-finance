/**
 * @file queries.ts
 * @description Chargement des données crypto depuis Supabase.
 */

import { fetchCryptoPricesEur } from "@/lib/crypto/prices";
import {
  buildCryptoHoldingViews,
  buildCryptoPortfolioSummary,
  mapCryptoHolding,
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
  schemaReady: boolean;
  isDemo: boolean;
}

export async function getCryptoPortfolioData(): Promise<CryptoPortfolioData> {
  const user = await getAppUser();
  const emptySummary = {
    currentValueEur: 0,
    costBasisEur: 0,
    latentGainEur: 0,
    flatTaxEur: 0,
    netIfSoldTodayEur: 0,
    holdingCount: 0,
    pricedCount: 0,
  };

  if (!user || user.isDemo) {
    return {
      holdings: [],
      transactions: [],
      summary: emptySummary,
      schemaReady: false,
      isDemo: true,
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      holdings: [],
      transactions: [],
      summary: emptySummary,
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

  const schemaReady = !holdingsError && !transactionsError;
  if (!schemaReady) {
    return {
      holdings: [],
      transactions: [],
      summary: emptySummary,
      schemaReady: false,
      isDemo: false,
    };
  }

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
  const summary = buildCryptoPortfolioSummary(views);

  return {
    holdings: views,
    transactions,
    summary,
    schemaReady: true,
    isDemo: false,
  };
}
