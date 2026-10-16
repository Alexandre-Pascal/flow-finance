/**
 * @file refunds.ts
 * @description Remboursements : une rentrée qui annule une dépense passée.
 *
 * Quatre amis me rendent 20 € sur les 100 € de loisirs que j'ai avancés. Ce
 * n'est pas un revenu — mon budget n'a pas grossi de 80 € —, c'est la dépense
 * qui n'était que de 20 €. Un remboursement se retranche donc de sa catégorie
 * et ne compte jamais comme une entrée.
 *
 * Aucune colonne dédiée : **une rentrée que l'utilisateur a catégorisée est un
 * remboursement de cette catégorie**. Le contrat tient parce que la
 * catégorisation automatique ne touche que les débits (`rematch-categories.ts`
 * filtre `amount < 0`) ; exiger `category_manual` le protège même si cette
 * règle changeait un jour.
 */

import type { TransactionWithAccount } from "@/types/database";

export function isRefund(
  tx: Pick<
    TransactionWithAccount,
    "amount" | "category_id" | "category_manual"
  >,
): boolean {
  return tx.amount > 0 && Boolean(tx.category_manual) && Boolean(tx.category_id);
}
