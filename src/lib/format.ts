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
 * Formate une fourchette de montants (ex. « 96,91–150,00 € »).
 * Si min === max, revient à un montant unique.
 */
export function formatCurrencyRange(
  minAmount: number,
  maxAmount: number,
  locale: string,
  currency = "EUR",
): string {
  const min = Math.round(Math.min(minAmount, maxAmount) * 100) / 100;
  const max = Math.round(Math.max(minAmount, maxAmount) * 100) / 100;
  if (min === max) {
    return formatCurrency(min, locale, currency);
  }

  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const numberFormatter = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const currencyFormatter = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
  });
  const currencySuffix = currencyFormatter
    .format(0)
    .replace(/[\d\s.,\u00a0\u202f]/g, "")
    .trim();

  return `${numberFormatter.format(min)}–${numberFormatter.format(max)}\u00a0${currencySuffix}`;
}

/**
 * Formate un montant en notation compacte (ex. « 12,3 k€ »), pour les axes de
 * graphique et les libellés courts.
 */
export function formatCompactCurrency(
  amount: number,
  locale: string,
  currency = "EUR",
): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
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
