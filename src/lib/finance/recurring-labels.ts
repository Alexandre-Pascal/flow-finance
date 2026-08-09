/**
 * @file recurring-labels.ts
 * @description Normalisation des libellés pour détection et matching des prélèvements hors PayPal.
 */

export const GENERAL_RECURRING_AMOUNT_TOLERANCE = 0.15;

/** Réf. contrat / facture : I0000977895043, CONTRAT000…, AX000…, etc. */
const ALPHANUMERIC_REF =
  /\b(?:[A-Z]{1,12})?\d{6,}[A-Z0-9]*\b/gi;

function normalizeMerchantFragment(fragment: string): string {
  return fragment
    .replace(/\bFR\d{2}ZZZ[A-Z0-9]+\b/gi, " ")
    .replace(/\bEMAC\b/gi, " ")
    .replace(/\bF\d{10,}\b/gi, " ")
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, " ")
    .replace(/\b(20)?\d{6}\b/g, " ")
    .replace(ALPHANUMERIC_REF, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b\d{1,2}\s*$/g, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clé stable pour regrouper des libellés qui varient (date, ref) mois après mois. */
export function recurringGroupKey(description: string): string {
  const upper = description.trim().toUpperCase();

  const cardMatch = upper.match(/^PAIEMENT PAR CARTE\s+X\d{4}\s+(.+)$/);
  if (cardMatch) {
    return normalizeMerchantFragment(cardMatch[1]);
  }

  const prlvMatch = upper.match(
    /^(?:PRLV|PRELEVEMENT|PRELEV)\s+(?:SEPA\s+)?(.+)$/,
  );
  if (prlvMatch) {
    return normalizeMerchantFragment(prlvMatch[1]);
  }

  return normalizeMerchantFragment(upper);
}

function isReferenceToken(token: string): boolean {
  if (/^FR\d{2}ZZZ/.test(token) || token === "EMAC") {
    return true;
  }
  if (/^F?\d{5,}$/.test(token) || /^\d{1,2}$/.test(token)) {
    return true;
  }
  // I0000977895043, CONTRAT000…, AX000… : au moins 6 chiffres dans le token
  return /(?:[A-Z]{1,12})?\d{6,}[A-Z0-9]*/.test(token) && /\d{6,}/.test(token);
}

/** Motif court enregistré en base et utilisé pour le matching. */
export function generalRecurringMatchPattern(groupKey: string): string {
  const tokens = groupKey.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const stable: string[] = [];

  for (const token of tokens) {
    if (/^FR\d{2}ZZZ/.test(token) || token === "EMAC") {
      break;
    }
    if (isReferenceToken(token)) {
      continue;
    }
    if (stable.length > 0 && stable.includes(token)) {
      break;
    }
    stable.push(token);
    if (stable.length >= 5) {
      break;
    }
  }

  const pattern = stable.join(" ").trim();
  if (pattern.length >= 3) {
    return pattern;
  }

  return groupKey.trim().toUpperCase().slice(0, 32).trim();
}

export function descriptionMatchesGeneralPattern(
  description: string,
  pattern: string,
): boolean {
  const normalizedPattern = generalRecurringMatchPattern(pattern);
  if (!normalizedPattern) {
    return true;
  }

  const patternTokens = normalizedPattern.split(/\s+/).filter(Boolean);
  if (patternTokens.length === 0) {
    return true;
  }

  const upper = description.toUpperCase();
  if (upper.includes(normalizedPattern)) {
    return true;
  }

  const txKey = recurringGroupKey(description);
  const txPattern = generalRecurringMatchPattern(txKey);
  if (
    txPattern === normalizedPattern ||
    txKey.includes(normalizedPattern) ||
    normalizedPattern.includes(txKey)
  ) {
    return true;
  }

  // Tokens stables dans l'ordre, même si une ref (ex. « 46 ») s'intercale.
  return (
    tokensAppearInOrder(txKey, patternTokens) ||
    tokensAppearInOrder(upper, patternTokens)
  );
}

function tokensAppearInOrder(haystack: string, tokens: string[]): boolean {
  const haystackTokens = haystack
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  let index = 0;

  for (const token of tokens) {
    while (index < haystackTokens.length && haystackTokens[index] !== token) {
      index += 1;
    }
    if (index >= haystackTokens.length) {
      return false;
    }
    index += 1;
  }

  return true;
}

export function generalPatternsMatch(
  patternA: string,
  patternB: string,
): boolean {
  const a = generalRecurringMatchPattern(patternA);
  const b = generalRecurringMatchPattern(patternB);
  if (!a || !b) {
    return false;
  }

  return a === b || a.includes(b) || b.includes(a);
}
