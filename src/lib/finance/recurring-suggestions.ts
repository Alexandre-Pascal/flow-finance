/**
 * @file recurring-suggestions.ts
 * @description Agrégation des suggestions PayPal et prélèvements récurrents généraux.
 */

import { listUnknownGeneralRecurringClusters } from "@/lib/finance/recurring-detection";
import {
  listUnknownPayPalAmounts,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import type { RecurringPayment, TransactionWithAccount } from "@/types/database";

export function listRecurringClusterSuggestions(
  transactions: TransactionWithAccount[],
  rules: RecurringPayment[],
): RecurringClusterSuggestion[] {
  const paypal = listUnknownPayPalAmounts(transactions, rules);
  const general = listUnknownGeneralRecurringClusters(transactions, rules);
  return [...paypal, ...general].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
