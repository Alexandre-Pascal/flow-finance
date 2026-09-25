import { describe, expect, it } from "vitest";
import {
  buildCategoryBreakdown,
  SPACE_TRANSFER_KEY,
  SUBSCRIPTIONS_KEY,
} from "./category-analytics";
import type { TransactionWithAccount } from "@/types/database";

const labels = {
  subscriptions: "Abonnements",
  uncategorized: "Non classé",
  spaceTransfer: "Compte joint",
};

function tx(
  partial: Partial<TransactionWithAccount> &
    Pick<TransactionWithAccount, "id" | "amount" | "booking_date">,
): TransactionWithAccount {
  return {
    account_id: "acc-1",
    entry_reference: `ref-${partial.id}`,
    currency: "EUR",
    status: "BOOK",
    description: "PAIEMENT PAR CARTE X0745 LIDL",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: "",
    updated_at: "",
    account_name: "Compte courant",
    account_type: "checking",
    ...partial,
  };
}

const crossSpace = {
  counterpart_account_id: "joint",
  counterpart_account_name: "Compte joint",
  direction: "out" as const,
  counterpart_space_id: "partage",
  same_space: false,
};

describe("buildCategoryBreakdown — virements", () => {
  const month = new Date().toISOString().slice(0, 10);

  it("files a contribution to another space under its own bucket", () => {
    const { months, meta } = buildCategoryBreakdown(
      [
        tx({
          id: "tx-1",
          amount: -300,
          booking_date: month,
          account_transfer: crossSpace,
        }),
      ],
      "fr",
      labels,
    );

    expect(meta[SPACE_TRANSFER_KEY]?.name).toBe("Compte joint");
    expect(months.at(-1)?.values[SPACE_TRANSFER_KEY]).toBe(300);
  });

  it("keeps that contribution out of subscriptions, even once detected as one", () => {
    // Un versement mensuel au compte joint a la forme parfaite d'un
    // abonnement : sans l'ordre choisi dans resolveBucket, il y atterrirait.
    const { months } = buildCategoryBreakdown(
      [
        tx({
          id: "tx-2",
          amount: -300,
          booking_date: month,
          recurring_payment_id: "rule-1",
          account_transfer: crossSpace,
        }),
      ],
      "fr",
      labels,
    );

    expect(months.at(-1)?.values[SPACE_TRANSFER_KEY]).toBe(300);
    expect(months.at(-1)?.values[SUBSCRIPTIONS_KEY]).toBeUndefined();
  });

  it("ignores a move that stays inside the space", () => {
    const { meta } = buildCategoryBreakdown(
      [
        tx({
          id: "tx-3",
          amount: -300,
          booking_date: month,
          account_transfer: {
            counterpart_account_id: null,
            counterpart_account_name: null,
            direction: "out",
            counterpart_space_id: null,
            same_space: true,
          },
        }),
      ],
      "fr",
      labels,
    );

    // Rien à ranger : le mouvement n'est ni une dépense ni un revenu.
    expect(Object.keys(meta)).toHaveLength(0);
  });
});
