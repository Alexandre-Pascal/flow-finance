/**
 * @file tickers.ts
 * @description Mapping ISIN → symbole de cotation Yahoo Finance pour les ETF
 * et actions éligibles au PEA. Le ticker saisi sur la ligne du portefeuille
 * prime toujours sur ce mapping, qui ne sert que de valeur par défaut.
 */

export const ISIN_TO_TICKER: Record<string, string> = {
  // ETF monde / marchés développés
  LU1681043599: "CW8.PA", // Amundi MSCI World UCITS ETF
  FR0011869353: "EWLD.PA", // Amundi MSCI World UCITS ETF (ex-Lyxor)
  IE00B4L5Y983: "EUNL.DE", // iShares Core MSCI World
  IE00BK5BQT80: "VWCE.DE", // Vanguard FTSE All-World
  LU1781541179: "LCWD.PA", // Amundi MSCI World
  IE0002XZSHO1: "WPEA.PA", // iShares MSCI World Swap PEA UCITS ETF
  IE000QSD6LQ3: "WEBN.DE", // Amundi Prime All Country World

  // ETF S&P 500 / États-Unis
  FR0010315770: "ESE.PA", // BNP Paribas Easy S&P 500
  IE00B5BMR087: "CSPX.AS", // iShares Core S&P 500
  LU1681048804: "500.PA", // Amundi S&P 500
  IE00B3XXRP09: "VUSA.AS", // Vanguard S&P 500

  // ETF Europe / zone euro
  LU1681042609: "CE8.PA", // Amundi MSCI Europe
  FR0010655712: "ETZ.PA", // BNP Paribas Easy Stoxx Europe 600
  LU1681047079: "MTD.PA", // Amundi Stoxx Europe 600

  // ETF marchés émergents
  IE00BKM4GZ66: "EMIM.AS", // iShares Core MSCI EM IMI
  LU1681045370: "AEEM.PA", // Amundi MSCI Emerging Markets

  // ETF thématiques et petites capitalisations
  IE00BF4RFH31: "WSML.AS", // iShares MSCI World Small Cap
  LU1829221024: "CD8.PA", // Amundi MSCI World Information Technology
};

/** Normalise un ISIN (12 caractères alphanumériques, majuscules). */
export function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase().replace(/\s/g, "");
}

/**
 * Résout le symbole de cotation d'une ligne : le ticker explicite prime,
 * sinon on retombe sur le mapping ISIN connu.
 */
export function resolveTicker(
  isin: string,
  ticker?: string | null,
): string | null {
  const explicit = ticker?.trim().toUpperCase();
  if (explicit) {
    return explicit;
  }
  return ISIN_TO_TICKER[normalizeIsin(isin)] ?? null;
}

export function uniqueTickers(tickers: Array<string | null>): string[] {
  return [
    ...new Set(
      tickers
        .filter((ticker): ticker is string => Boolean(ticker))
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}
