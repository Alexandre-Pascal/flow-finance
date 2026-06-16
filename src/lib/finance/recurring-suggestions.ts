/**
 * @file recurring-suggestions.ts
 * @description Agrégation des suggestions PayPal et prélèvements récurrents généraux.
 */

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
  const paypal = listUnknownPayPalAmounts(transactions, rules);
  const general = listUnknownGeneralRecurringClusters(transactions, rules);
  return [...paypal, ...general]
    .filter((suggestion) => !dismissed.has(clusterDismissalKey(suggestion)))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
