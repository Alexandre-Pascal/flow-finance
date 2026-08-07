/**
 * @file queries.ts
 * @description Chargement des données du PEA depuis Supabase.
 */

import { fetchQuotesEur } from "@/lib/market/prices";
import { resolveTicker } from "@/lib/market/tickers";
import { getAppUser } from "@/lib/auth";
import { mapPeaInvestmentPlan } from "@/lib/pea/transfers";
import { createClient } from "@/lib/supabase/server";
import {
  buildPeaHoldingViews,
  buildPeaPortfolioSummary,
  mapPeaHolding,
  mapPeaSettings,
  mapPeaTransaction,
  type PeaHoldingView,
  type PeaPortfolioSummary,
} from "@/lib/pea/valuation";
import type {
  PeaInvestmentPlan,
  PeaSettings,
  PeaTransaction,
} from "@/types/database";

export interface PeaPortfolioData {
  holdings: PeaHoldingView[];
  transactions: PeaTransaction[];
  plans: PeaInvestmentPlan[];
  settings: PeaSettings;
  summary: PeaPortfolioSummary;
  schemaReady: boolean;
  isDemo: boolean;
}

const EMPTY_SUMMARY: PeaPortfolioSummary = {
  currentValueEur: 0,
  totalDepositedEur: 0,
  latentGainEur: 0,
  taxRate: 0.3,
  taxEur: 0,
  netIfSoldTodayEur: 0,
  isMatured: false,
  maturityDate: null,
  holdingCount: 0,
  pricedCount: 0,
  cashBalanceEur: 0,
  totalValueEur: 0,
  hasEstimates: false,
};

function emptySettings(userId: string): PeaSettings {
  return {
    user_id: userId,
    opening_date: null,
    cash_balance_eur: 0,
    created_at: "",
    updated_at: "",
  };
}

function emptyData(userId: string, isDemo: boolean): PeaPortfolioData {
  return {
    holdings: [],
    transactions: [],
    plans: [],
    settings: emptySettings(userId),
    summary: EMPTY_SUMMARY,
    schemaReady: false,
    isDemo,
  };
}

export async function getPeaPortfolioData(): Promise<PeaPortfolioData> {
  const user = await getAppUser();

  if (!user || user.isDemo) {
    return emptyData(user?.id ?? "demo", true);
  }

  const supabase = await createClient();
  if (!supabase) {
    return emptyData(user.id, false);
  }

  const [
    { data: holdingRows, error: holdingsError },
    { data: transactionRows, error: transactionsError },
    { data: planRows, error: plansError },
    { data: settingsRow, error: settingsError },
  ] = await Promise.all([
    supabase
      .from("pea_holdings")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("pea_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false }),
    supabase
      .from("pea_investment_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("pea_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const schemaReady =
    !holdingsError && !transactionsError && !plansError && !settingsError;
  if (!schemaReady) {
    return emptyData(user.id, false);
  }

  const holdings = (holdingRows ?? []).map((row) =>
    mapPeaHolding(row as Record<string, unknown>),
  );
  const transactions = (transactionRows ?? []).map((row) =>
    mapPeaTransaction(row as Record<string, unknown>),
  );
  const plans = (planRows ?? []).map((row) =>
    mapPeaInvestmentPlan(row as Record<string, unknown>),
  );
  const settings = mapPeaSettings(
    settingsRow as Record<string, unknown> | null,
    user.id,
  );

  const estimatedHoldingIds = new Set(
    transactions
      .filter((tx) => tx.source === "bank_estimate" && tx.holding_id)
      .map((tx) => String(tx.holding_id)),
  );

  let pricesEur: Record<string, number> = {};
  try {
    pricesEur = await fetchQuotesEur(
      holdings.map((holding) => resolveTicker(holding.isin, holding.ticker)),
    );
  } catch {
    pricesEur = {};
  }

  const views = buildPeaHoldingViews(holdings, pricesEur, estimatedHoldingIds);
  const summary = buildPeaPortfolioSummary(views, transactions, settings);

  return {
    holdings: views,
    transactions,
    plans,
    settings,
    summary,
    schemaReady: true,
    isDemo: false,
  };
}
