/**
 * @file transfers.ts
 * @description Détection des virements vers le PEA à partir du libellé bancaire.
 * Un plan d'investissement porte des mots-clés et une ligne cible : un virement
 * reconnu alimente le plan et se traduit par une estimation de parts achetées.
 */

import type {
  PeaHolding,
  PeaInvestmentPlan,
  PeaTransferRef,
  TransactionWithAccount,
} from "@/types/database";

export function mapPeaInvestmentPlan(
  row: Record<string, unknown>,
): PeaInvestmentPlan {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    label: String(row.label ?? ""),
    keywords: Array.isArray(row.keywords)
      ? (row.keywords as unknown[]).map(String)
      : [],
    holding_id: row.holding_id ? String(row.holding_id) : null,
    expected_amount_eur:
      row.expected_amount_eur == null ? null : Number(row.expected_amount_eur),
    active: row.active !== false,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * Détermine si une transaction correspond à un plan d'investissement PEA,
 * en comparant son libellé aux mots-clés configurés.
 */
export function matchPeaTransfer(
  tx: Pick<TransactionWithAccount, "description">,
  plans: PeaInvestmentPlan[],
): PeaInvestmentPlan | null {
  const description = tx.description.toUpperCase();

  for (const plan of plans) {
    if (!plan.active) {
      continue;
    }
    for (const keyword of plan.keywords) {
      const needle = keyword.trim().toUpperCase();
      if (needle.length >= 2 && description.includes(needle)) {
        return plan;
      }
    }
  }

  return null;
}

/** Annote chaque transaction avec son éventuel virement vers le PEA. */
export function annotatePeaTransfers(
  transactions: TransactionWithAccount[],
  plans: PeaInvestmentPlan[],
  holdings: PeaHolding[] = [],
): TransactionWithAccount[] {
  if (plans.length === 0) {
    return transactions;
  }

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const holdingById = new Map(holdings.map((holding) => [holding.id, holding]));

  function toRef(
    plan: PeaInvestmentPlan,
    direction: "deposit" | "withdrawal",
  ): PeaTransferRef {
    const holding = plan.holding_id ? holdingById.get(plan.holding_id) : null;
    return {
      plan_id: plan.id,
      plan_label: plan.label,
      holding_id: plan.holding_id,
      holding_name: holding?.name ?? null,
      direction,
    };
  }

  return transactions.map((tx) => {
    let pea_transfer: PeaTransferRef | null = null;

    if (tx.pea_manual && tx.pea_plan_id) {
      // Affectation manuelle : prime sur les mots-clés. La direction est déduite
      // du signe (sortie du compte courant = versement sur le PEA).
      const plan = planById.get(tx.pea_plan_id);
      if (plan) {
        pea_transfer = toRef(plan, tx.amount < 0 ? "deposit" : "withdrawal");
      }
    } else {
      const plan = matchPeaTransfer(tx, plans);
      if (plan) {
        pea_transfer = toRef(plan, tx.amount < 0 ? "deposit" : "withdrawal");
      }
    }

    return { ...tx, pea_transfer };
  });
}

export function isPeaTransfer(
  tx: Pick<TransactionWithAccount, "pea_transfer">,
): boolean {
  return tx.pea_transfer != null;
}

/**
 * Virement interne : déplacement entre les enveloppes de l'utilisateur
 * (livret ou PEA), à ne jamais comptabiliser comme une dépense ou un revenu.
 */
export function isInternalTransfer(
  tx: Pick<TransactionWithAccount, "savings_transfer" | "pea_transfer">,
): boolean {
  return tx.savings_transfer != null || tx.pea_transfer != null;
}
