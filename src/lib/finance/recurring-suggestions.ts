/**
 * @file recurring-suggestions.ts
 * @description Agrégation des suggestions PayPal et prélèvements récurrents généraux.
 */

import { isAccountTransfer } from "@/lib/finance/account-transfers";
import {
  listUnknownGeneralRecurringClusters,
} from "@/lib/finance/recurring-detection";
import {
  clusterDismissalKey,
  listUnknownPayPalAmounts,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import type { RecurringPayment, TransactionWithAccount } from "@/types/database";

export function listRecurringClusterSuggestions(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
  dismissedClusterKeys: Iterable<string> = [],
): RecurringClusterSuggestion[] {
  const dismissed = new Set(dismissedClusterKeys);
  // Un virement entre comptes revient tous les mois et ressemble à s'y
  // méprendre à un abonnement : il n'en est pas un.
  const candidates = transactions.filter((tx) => !isAccountTransfer(tx));
  const paypal = listUnknownPayPalAmounts(candidates, rules);
  const general = listUnknownGeneralRecurringClusters(candidates, rules);
  return [...paypal, ...general]
    .filter((suggestion) => !dismissed.has(clusterDismissalKey(suggestion)))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
