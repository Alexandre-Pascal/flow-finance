/**
 * @file prices.ts
 * @description Cours EUR via CoinGecko (cache mémoire 5 min).
 */

import { resolveCoingeckoId, uniqueSymbols } from "@/lib/crypto/symbols";

const CACHE_TTL_MS = 5 * 60 * 1000;
const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price";

interface PriceCacheEntry {
  fetchedAt: number;
  prices: Record<string, number>;
}

const cache = new Map<string, PriceCacheEntry>();

function cacheKey(symbols: string[]): string {
  return uniqueSymbols(symbols).sort().join(",");
}

/**
 * Récupère les cours EUR pour une liste de symboles (BTC, ETH…).
 */
export async function fetchCryptoPricesEur(
  symbols: string[],
): Promise<Record<string, number>> {
  const normalized = uniqueSymbols(symbols);
  if (normalized.length === 0) {
    return {};
  }

  const key = cacheKey(normalized);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.prices;
  }

  const symbolToId = new Map<string, string>();
  for (const symbol of normalized) {
    const id = resolveCoingeckoId(symbol);
    if (id) {
      symbolToId.set(symbol, id);
    }
  }

  const ids = [...new Set(symbolToId.values())];
  if (ids.length === 0) {
    return {};
  }

  const url = `${COINGECKO_API}?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=eur`;
  const response = await fetch(url, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, { eur?: number }>;
  const prices: Record<string, number> = {};

  for (const [symbol, id] of symbolToId.entries()) {
    const eur = payload[id]?.eur;
    if (typeof eur === "number" && Number.isFinite(eur)) {
      prices[symbol] = eur;
    }
  }

  cache.set(key, { fetchedAt: Date.now(), prices });
  return prices;
}

export function clearCryptoPriceCache(): void {
  cache.clear();
}
