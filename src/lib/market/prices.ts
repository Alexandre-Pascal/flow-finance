/**
 * @file prices.ts
 * @description Cours EUR des titres (ETF, actions) via l'API chart Yahoo
 * Finance, gratuite et sans clé. Cache mémoire 5 min, comme les cours crypto.
 */

import { uniqueTickers } from "@/lib/market/tickers";

const CACHE_TTL_MS = 5 * 60 * 1000;
const YAHOO_CHART_API = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT = "Mozilla/5.0 (compatible; FlowFinance/1.0)";
const DAY_MS = 24 * 60 * 60 * 1000;

interface QuoteCacheEntry {
  fetchedAt: number;
  prices: Record<string, number>;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

const quoteCache = new Map<string, QuoteCacheEntry>();
const historicalCache = new Map<string, number | null>();

async function fetchChart(
  ticker: string,
  query: string,
  revalidate: number,
): Promise<YahooChartResponse | null> {
  const url = `${YAHOO_CHART_API}/${encodeURIComponent(ticker)}?${query}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as YahooChartResponse;
}

/**
 * Récupère le dernier cours EUR pour une liste de symboles de cotation.
 * Les titres cotés dans une autre devise sont ignorés : mieux vaut une ligne
 * non valorisée qu'un patrimoine faux.
 */
export async function fetchQuotesEur(
  tickers: Array<string | null>,
): Promise<Record<string, number>> {
  const normalized = uniqueTickers(tickers);
  if (normalized.length === 0) {
    return {};
  }

  const key = [...normalized].sort().join(",");
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.prices;
  }

  const prices: Record<string, number> = {};

  const results = await Promise.allSettled(
    normalized.map(async (ticker) => {
      const payload = await fetchChart(ticker, "interval=1d&range=1d", 300);
      const meta = payload?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;

      if (
        meta?.currency === "EUR" &&
        typeof price === "number" &&
        Number.isFinite(price)
      ) {
        return { ticker, price };
      }

      return null;
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      prices[result.value.ticker] = result.value.price;
    }
  }

  quoteCache.set(key, { fetchedAt: Date.now(), prices });
  return prices;
}

/**
 * Cours de clôture EUR à une date donnée, utilisé pour estimer le nombre de
 * parts achetées par un virement détecté. On récupère une fenêtre de 10 jours
 * autour de la date puis on retient la dernière clôture antérieure ou égale,
 * ce qui couvre les week-ends et jours fériés.
 */
export async function fetchQuoteEurOn(
  ticker: string,
  date: string,
): Promise<number | null> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const cacheKey = `${normalized}@${date}`;
  if (historicalCache.has(cacheKey)) {
    return historicalCache.get(cacheKey) ?? null;
  }

  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const period1 = Math.floor((target.getTime() - 10 * DAY_MS) / 1000);
  const period2 = Math.floor((target.getTime() + DAY_MS) / 1000);

  let price: number | null = null;

  try {
    const payload = await fetchChart(
      normalized,
      `interval=1d&period1=${period1}&period2=${period2}`,
      86400,
    );
    const result = payload?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result?.timestamp ?? [];
    const targetSeconds = period2;

    if (result?.meta?.currency === "EUR") {
      for (let index = timestamps.length - 1; index >= 0; index -= 1) {
        const close = closes[index];
        if (
          timestamps[index] <= targetSeconds &&
          typeof close === "number" &&
          Number.isFinite(close)
        ) {
          price = close;
          break;
        }
      }
    }
  } catch {
    price = null;
  }

  historicalCache.set(cacheKey, price);
  return price;
}

export function clearMarketPriceCache(): void {
  quoteCache.clear();
  historicalCache.clear();
}
