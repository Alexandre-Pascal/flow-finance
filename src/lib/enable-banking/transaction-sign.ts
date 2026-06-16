/**
 * @file transaction-sign.ts
 * @description Détermine le sens d'une transaction (dépense vs revenu).
 */

export type CreditDebitIndicator = "CRDT" | "DBIT";

interface TransactionSignInput {
  credit_debit_indicator?: string;
  remittance_information?: string[];
  balance_after_transaction?: {
    amount: string;
    currency?: string;
  };
}

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
 * Devine le sens via l'évolution du solde après chaque opération.
 * Utile quand credit_debit_indicator est absent (historique CA).
 */
export function inferIndicatorsFromBalanceSequence(
  transactions: TransactionSignInput[],
): (CreditDebitIndicator | undefined)[] {
  const indicators: (CreditDebitIndicator | undefined)[] = new Array(
    transactions.length,
  );
  let previousBalance: number | null = null;

  for (let index = 0; index < transactions.length; index += 1) {
    const balanceAfter = transactions[index].balance_after_transaction?.amount;
    if (balanceAfter === undefined) continue;

    const currentBalance = Number(balanceAfter);

    if (previousBalance !== null) {
      const delta = currentBalance - previousBalance;
      if (delta < -0.001) indicators[index] = "DBIT";
      if (delta > 0.001) indicators[index] = "CRDT";
    }

    previousBalance = currentBalance;
  }

  return indicators;
}

/**
 * Résout l'indicateur : API → libellé → solde (dans cet ordre).
 */
export function resolveTransactionIndicator(
  tx: TransactionSignInput,
  balanceInferred?: CreditDebitIndicator,
): CreditDebitIndicator | undefined {
  const description =
    tx.remittance_information?.join(" ") ?? "Transaction bancaire";

  return (
    normalizeCreditDebitIndicator(tx.credit_debit_indicator) ??
    inferIndicatorFromDescription(description) ??
    balanceInferred
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
