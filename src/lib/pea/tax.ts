/**
 * @file tax.ts
 * @description Estimation de l'imposition d'un retrait du PEA.
 * Avant 5 ans de détention : PFU 30 %. Au-delà : exonération d'impôt sur le
 * revenu, seuls les prélèvements sociaux de 17,2 % restent dus.
 */

export const PEA_FLAT_TAX_RATE = 0.3;
export const PEA_SOCIAL_CHARGES_RATE = 0.172;
export const PEA_MATURITY_YEARS = 5;

export interface PeaTaxBreakdown {
  currentValueEur: number;
  totalDepositedEur: number;
  latentGainEur: number;
  taxRate: number;
  taxEur: number;
  netIfSoldTodayEur: number;
  /** Vrai si le plan a dépassé les 5 ans (exonération d'impôt sur le revenu). */
  isMatured: boolean;
  /** Date des 5 ans, nulle tant que la date d'ouverture n'est pas renseignée. */
  maturityDate: string | null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Date d'échéance fiscale : cinq ans après l'ouverture du plan. */
export function computeMaturityDate(openingDate: string | null): string | null {
  if (!openingDate) {
    return null;
  }

  const opened = new Date(`${openingDate}T00:00:00Z`);
  if (Number.isNaN(opened.getTime())) {
    return null;
  }

  opened.setUTCFullYear(opened.getUTCFullYear() + PEA_MATURITY_YEARS);
  return opened.toISOString().slice(0, 10);
}

/**
 * Calcule l'imposition estimée sur la plus-value latente du plan entier.
 * Tant que la date d'ouverture n'est pas renseignée, on retient l'hypothèse
 * prudente du PFU à 30 %.
 */
export function computePeaTax(
  currentValueEur: number,
  totalDepositedEur: number,
  openingDate: string | null,
  now: Date = new Date(),
): PeaTaxBreakdown {
  const current = round(currentValueEur);
  const deposited = round(totalDepositedEur);
  const latentGainEur = round(Math.max(0, current - deposited));

  const maturityDate = computeMaturityDate(openingDate);
  const isMatured =
    maturityDate != null && new Date(`${maturityDate}T00:00:00Z`) <= now;

  const taxRate = isMatured ? PEA_SOCIAL_CHARGES_RATE : PEA_FLAT_TAX_RATE;
  const taxEur = round(latentGainEur * taxRate);

  return {
    currentValueEur: current,
    totalDepositedEur: deposited,
    latentGainEur,
    taxRate,
    taxEur,
    netIfSoldTodayEur: round(current - taxEur),
    isMatured,
    maturityDate,
  };
}
