/**
 * @file flat-tax.ts
 * @description Estimation PFU (flat tax 30 %) sur plus-values crypto latentes.
 */

export const FLAT_TAX_RATE = 0.3;

export interface FlatTaxBreakdown {
  currentValueEur: number;
  costBasisEur: number;
  latentGainEur: number;
  flatTaxEur: number;
  netIfSoldTodayEur: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeFlatTax(
  quantity: number,
  costBasisEur: number,
  priceEur: number,
): FlatTaxBreakdown {
  const currentValueEur = round(quantity * priceEur);
  const cost = round(costBasisEur);
  const latentGainEur = round(Math.max(0, currentValueEur - cost));
  const flatTaxEur = round(latentGainEur * FLAT_TAX_RATE);
  const netIfSoldTodayEur = round(currentValueEur - flatTaxEur);

  return {
    currentValueEur,
    costBasisEur: cost,
    latentGainEur,
    flatTaxEur,
    netIfSoldTodayEur,
  };
}

export function sumFlatTaxBreakdowns(rows: FlatTaxBreakdown[]): FlatTaxBreakdown {
  return rows.reduce(
    (acc, row) => ({
      currentValueEur: round(acc.currentValueEur + row.currentValueEur),
      costBasisEur: round(acc.costBasisEur + row.costBasisEur),
      latentGainEur: round(acc.latentGainEur + row.latentGainEur),
      flatTaxEur: round(acc.flatTaxEur + row.flatTaxEur),
      netIfSoldTodayEur: round(acc.netIfSoldTodayEur + row.netIfSoldTodayEur),
    }),
    {
      currentValueEur: 0,
      costBasisEur: 0,
      latentGainEur: 0,
      flatTaxEur: 0,
      netIfSoldTodayEur: 0,
    },
  );
}
