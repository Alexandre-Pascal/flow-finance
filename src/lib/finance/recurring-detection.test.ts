import { describe, expect, it } from "vitest";
import { listUnknownGeneralRecurringClusters } from "./recurring-detection";
import { matchesRecurringPayment } from "./recurring-payments";
import type { RecurringPayment, TransactionWithAccount } from "@/types/database";

function rule(
  partial: Partial<RecurringPayment> & Pick<RecurringPayment, "id" | "name" | "amount">,
): RecurringPayment {
  return {
    user_id: "user-1",
    amount_tolerance: 0.15,
    amount_flexible: false,
    description_pattern: partial.name.toUpperCase(),
    billing_day: 5,
    cadence: "monthly",
    billing_month: null,
    merged_into_id: null,
    active_to: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function tx(
  partial: Partial<TransactionWithAccount> &
    Pick<TransactionWithAccount, "id" | "amount" | "description" | "booking_date">,
): TransactionWithAccount {
  return {
    account_id: "acc-1",
    entry_reference: `ref-${partial.id}`,
    currency: "EUR",
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    account_name: "Compte courant",
    account_type: "checking",
    ...partial,
  };
}

const FREE_MOBILE_TXS = [
  tx({
    id: "fm-1",
    amount: -31.98,
    description:
      "PRELEVEMENT FREE MOBILE fmpmt-2441268385 ++FM-12189729-1 FR07ZZZ591778",
    booking_date: "2026-07-16",
  }),
  tx({
    id: "fm-2",
    amount: -38.69,
    description:
      "PRELEVEMENT FREE MOBILE fmpmt-2425519539 ++FM-12189729-1 FR07ZZZ591778",
    booking_date: "2026-06-17",
  }),
  tx({
    id: "fm-3",
    amount: -19.99,
    description:
      "PRELEVEMENT FREE MOBILE fmpmt-2406787004 FM-57157264-1 FR07ZZZ591778",
    booking_date: "2026-05-18",
  }),
];

const EDF_TXS = [
  tx({
    id: "edf-1",
    amount: -96.91,
    description:
      "PRELEVEMENT ELECTRICITE DE FRANCE PASCAL JEROME Numero de client : 5019329716 - Numero de compte : 7018357957 FR47EDF001007",
    booking_date: "2026-08-05",
  }),
  tx({
    id: "edf-2",
    amount: -58.23,
    description:
      "PRELEVEMENT ELECTRICITE DE FRANCE PASCAL JEROME Numero de client : 5019329716 - Numero de compte : 4018069587 FR47EDF001007",
    booking_date: "2026-07-10",
  }),
  tx({
    id: "edf-3",
    amount: -269.01,
    description:
      "PRELEVEMENT ELECTRICITE DE FRANCE PASCAL JEROME Numero de client : 5019329716 - Numero de compte : 4048323217 FR47EDF001007",
    booking_date: "2026-07-22",
  }),
];

describe("listUnknownGeneralRecurringClusters with variable amounts", () => {
  const referenceDate = new Date("2026-08-09T12:00:00Z");

  it("suggests Free Mobile despite invoice numbers and varying amounts", () => {
    const suggestions = listUnknownGeneralRecurringClusters(
      FREE_MOBILE_TXS,
      [],
      referenceDate,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].amountFlexible).toBe(true);
    expect(suggestions[0].descriptionPattern).toContain("FREE MOBILE");
    expect(suggestions[0].count).toBeGreaterThanOrEqual(2);
  });

  it("suggests EDF with widely varying amounts", () => {
    const suggestions = listUnknownGeneralRecurringClusters(
      EDF_TXS,
      [],
      referenceDate,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].amountFlexible).toBe(true);
    expect(suggestions[0].descriptionPattern).toContain("ELECTRICITE");
  });
});

describe("matchesRecurringPayment with amount_flexible", () => {
  it("links Free Mobile lines at different amounts when flexible", () => {
    const flexible = rule({
      id: "free-mobile",
      name: "Free Mobile",
      amount: 31.98,
      amount_flexible: true,
      description_pattern: "FREE MOBILE FMPMT FM",
      billing_day: 16,
    });

    expect(
      FREE_MOBILE_TXS.filter((entry) => matchesRecurringPayment(entry, flexible)),
    ).toHaveLength(3);
  });

  it("rejects different Free Mobile amounts when not flexible", () => {
    const fixed = rule({
      id: "free-mobile-fixed",
      name: "Free Mobile",
      amount: 31.98,
      amount_flexible: false,
      description_pattern: "FREE MOBILE FMPMT FM",
      billing_day: 16,
    });

    expect(matchesRecurringPayment(FREE_MOBILE_TXS[0], fixed)).toBe(true);
    expect(matchesRecurringPayment(FREE_MOBILE_TXS[1], fixed)).toBe(false);
  });
});
