/**
 * @file symbols.ts
 * @description Mapping symboles crypto → identifiants CoinGecko.
 */

export const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  LTC: "litecoin",
  XRP: "ripple",
  SOL: "solana",
  ADA: "cardano",
  DOT: "polkadot",
  MATIC: "matic-network",
  POL: "polygon-ecosystem-token",
  AVAX: "avalanche-2",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  DOGE: "dogecoin",
  LINK: "chainlink",
  ATOM: "cosmos",
  XLM: "stellar",
  TRX: "tron",
  BCH: "bitcoin-cash",
  XMR: "monero",
};

export function resolveCoingeckoId(symbol: string): string | null {
  const upper = symbol.trim().toUpperCase();
  return SYMBOL_TO_COINGECKO_ID[upper] ?? null;
}

export function uniqueSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}
