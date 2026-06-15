/**
 * @file format.ts
 * @description Helpers de formatage monétaire et dates pour l'UI.
 */

/**
 * Formate un montant en devise locale (EUR par défaut).
 */
export function formatCurrency(
  amount: number,
  locale: string,
  currency = "EUR",
): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Formate une date ISO (YYYY-MM-DD) pour l'affichage.
 */
export function formatDate(dateIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateIso));
}

/**
 * Masque partiellement un IBAN pour l'affichage (4 derniers caractères visibles).
 */
export function maskIban(iban: string): string {
  const normalized = iban.replace(/\s/g, "");
  if (normalized.length <= 8) return iban;
  return `•••• ${normalized.slice(-4)}`;
}
