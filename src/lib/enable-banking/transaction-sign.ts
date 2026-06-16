/**
 * @file transaction-sign.ts
 * @description Détermine le sens d'une transaction (dépense vs revenu).
 */

export type CreditDebitIndicator = "CRDT" | "DBIT";

/** Libellés courants Crédit Agricole / banques FR → sortie de compte. */
const DEBIT_DESCRIPTION_PATTERNS = [
  /^PAIEMENT PAR CARTE\b/,
  /^PAIEMENT CB\b/,
  /^PRELEVEMENT\b/,
  /^PRLV\b/,
  /^VIREMENT EMIS\b/,
  /^VIR\.?\s*EMIS\b/,
  /^VIREMENT DE\b/,
  /^RETRAIT\b/,
  /^CHEQUE\b/,
  /^FRAIS\b/,
  /^COMMISSION\b/,
  /^ECHEANCE\b/,
  /^MENS\.?\s*PEL\b/,
  /^ABONNEMENT\b/,
  /^ACHAT\b/,
  /^DEBIT\b/,
  /^CARTE\b/,
];

/** Libellés courants → entrée sur le compte. */
const CREDIT_DESCRIPTION_PATTERNS = [
  /VOTRE FAVEUR\b/,
  /^VIREMENT (RECU|REÇU)\b/,
  /^VIR\.?\s*(RECU|REÇU)\b/,
  /^REMBOURSEMENT\b/,
  /^CREDIT\b/,
  /^SALAIRE\b/,
];

/**
 * Normalise l'indicateur renvoyé par Enable Banking.
 */
export function normalizeCreditDebitIndicator(
  value?: string,
): CreditDebitIndicator | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "CRDT" || upper === "CREDIT") return "CRDT";
  if (upper === "DBIT" || upper === "DEBIT") return "DBIT";
  return undefined;
}

/**
 * Devine le sens à partir du libellé quand la banque n'envoie pas d'indicateur.
 */
export function inferIndicatorFromDescription(
  description: string,
): CreditDebitIndicator | undefined {
  const upper = description.toUpperCase().trim();

  for (const pattern of DEBIT_DESCRIPTION_PATTERNS) {
    if (pattern.test(upper)) return "DBIT";
  }

  for (const pattern of CREDIT_DESCRIPTION_PATTERNS) {
    if (pattern.test(upper)) return "CRDT";
  }

  return undefined;
}

/**
 * Résout l'indicateur final : API d'abord, libellé en secours.
 */
export function resolveCreditDebitIndicator(
  apiIndicator: string | undefined,
  description: string,
): CreditDebitIndicator | undefined {
  return (
    normalizeCreditDebitIndicator(apiIndicator) ??
    inferIndicatorFromDescription(description)
  );
}

/**
 * Convertit un montant EB (toujours positif) en montant signé pour l'app.
 * Convention : négatif = dépense, positif = revenu.
 */
export function mapSignedTransactionAmount(
  amount: string | number | undefined,
  indicator?: CreditDebitIndicator,
): number {
  const absolute = Math.abs(Number(amount ?? 0));
  if (indicator === "DBIT") return -absolute;
  if (indicator === "CRDT") return absolute;
  return absolute;
}
