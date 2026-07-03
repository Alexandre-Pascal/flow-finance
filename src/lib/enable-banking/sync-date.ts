/**
 * @file sync-date.ts
 * @description Calcul de date_from pour la sync incrémentale Enable Banking.
 */

const OVERLAP_DAYS = 3;

/**
 * Calcule la date de début pour une sync incrémentale.
 * Retourne undefined si aucune sync précédente (historique complet).
 */
export function computeTransactionDateFrom(
  lastTransactionsSyncedAt: string | null | undefined,
  strategy: "default" | "longest",
  now: Date = new Date(),
): string | undefined {
  if (strategy === "longest") {
    return undefined;
  }

  if (!lastTransactionsSyncedAt) {
    return undefined;
  }

  const anchor = new Date(lastTransactionsSyncedAt);
  anchor.setDate(anchor.getDate() - OVERLAP_DAYS);
  const overlapDate = anchor.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  return overlapDate <= today ? overlapDate : today;
}
