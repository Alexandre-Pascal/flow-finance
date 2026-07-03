/**
 * @file flat-tax.ts
 * @description Estimation PFU (flat tax 30 %) sur la plus-value latente du portefeuille.
 */

export const FLAT_TAX_RATE = 0.3;

export interface FlatTaxBreakdown {
  currentValueEur: number;
  totalInvestedEur: number;
  latentGainEur: number;
  flatTaxEur: number;
  netIfSoldTodayEur: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calcule la flat tax sur le portefeuille entier :
 * plus-value = max(0, valeur actuelle totale − investissement total de base).
 */
export function computePortfolioFlatTax(
  currentValueEur: number,
  totalInvestedEur: number,
): FlatTaxBreakdown {
  const current = round(currentValueEur);
  const invested = round(totalInvestedEur);
  const latentGainEur = round(Math.max(0, current - invested));
  const flatTaxEur = round(latentGainEur * FLAT_TAX_RATE);
  const netIfSoldTodayEur = round(current - flatTaxEur);

  return {
    currentValueEur: current,
    totalInvestedEur: invested,
    latentGainEur,
    flatTaxEur,
    netIfSoldTodayEur,
  };
}
