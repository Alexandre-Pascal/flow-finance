import { describe, expect, it } from "vitest";
import {
  assignRecurringPayments,
  buildMonthlySubscriptionOverview,
  groupRulesByCanonical,
  listActiveSubscriptions,
  listCanonicalRules,
  matchesRecurringPayment,
  resolveCanonicalRules,
} from "./recurring-payments";
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

const NETFLIX = rule({
  id: "netflix",
  name: "Netflix",
  amount: 13.49,
  description_pattern: "NETFLIX",
});

const NETFLIX_PAYPAL = rule({
  id: "netflix-paypal",
  name: "Netflix",
  amount: 13.49,
  description_pattern: "PAYPAL",
  amount_tolerance: 0.05,
  merged_into_id: "netflix",
});

describe("resolveCanonicalRules", () => {
  it("resolves a merged rule to its canonical subscription", () => {
    const canonical = resolveCanonicalRules([NETFLIX, NETFLIX_PAYPAL]);

    expect(canonical.get("netflix-paypal")?.id).toBe("netflix");
    expect(canonical.get("netflix")?.id).toBe("netflix");
  });

  it("follows a chain of merges", () => {
    const middle = rule({
      id: "middle",
      name: "Netflix",
      amount: 13.49,
      merged_into_id: "netflix",
    });
    const leaf = rule({
      id: "leaf",
      name: "Netflix",
      amount: 13.49,
      merged_into_id: "middle",
    });

    expect(
      resolveCanonicalRules([NETFLIX, middle, leaf]).get("leaf")?.id,
    ).toBe("netflix");
  });

  it("falls back to the rule itself on a broken reference or a cycle", () => {
    const orphan = rule({
      id: "orphan",
      name: "Spotify",
      amount: 10.99,
      merged_into_id: "missing",
    });
    const loopA = rule({ id: "a", name: "A", amount: 1, merged_into_id: "b" });
    const loopB = rule({ id: "b", name: "B", amount: 1, merged_into_id: "a" });

    const canonical = resolveCanonicalRules([orphan, loopA, loopB]);

    expect(canonical.get("orphan")?.id).toBe("orphan");
    expect(canonical.get("a")).toBeDefined();
    expect(canonical.get("b")).toBeDefined();
  });
});

describe("listCanonicalRules / groupRulesByCanonical", () => {
  it("keeps only the head of each group", () => {
    expect(listCanonicalRules([NETFLIX, NETFLIX_PAYPAL]).map((r) => r.id)).toEqual([
      "netflix",
    ]);
  });

  it("nests variants under their canonical subscription", () => {
    const groups = groupRulesByCanonical([NETFLIX_PAYPAL, NETFLIX]);

    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.id).toBe("netflix");
    expect(groups[0].variants.map((variant) => variant.id)).toEqual([
      "netflix-paypal",
    ]);
  });
});

describe("matchesRecurringPayment with active_to", () => {
  const paypalDebit = tx({
    id: "tx-new",
    amount: -13.49,
    description: "PRELEVEMENT PAYPAL EUROPE SARL",
    booking_date: "2026-08-05",
  });

  it("matches while the rule is still active", () => {
    expect(matchesRecurringPayment(paypalDebit, NETFLIX_PAYPAL)).toBe(true);
  });

  it("stops matching transactions booked after the archive date", () => {
    const archived = { ...NETFLIX_PAYPAL, active_to: "2026-07-31" };

    expect(matchesRecurringPayment(paypalDebit, archived)).toBe(false);
  });

  it("still matches transactions booked before the archive date", () => {
    const archived = { ...NETFLIX_PAYPAL, active_to: "2026-07-31" };
    const older = { ...paypalDebit, booking_date: "2026-07-05" };

    expect(matchesRecurringPayment(older, archived)).toBe(true);
  });
});

describe("a rule built from a single transaction", () => {
  // Reproduit la règle créée par createSubscriptionFromTransactionAction depuis
  // une seule transaction : le libellé et le montant suffisent à rattacher tout
  // l'historique, sans qu'aucune récurrence n'ait été détectée.
  const manualRule = rule({
    id: "spotify",
    name: "Spotify",
    amount: 11.12,
    description_pattern: "SPOTIFY",
    billing_day: 14,
  });

  const history = [
    tx({
      id: "tx-1",
      amount: -11.12,
      description: "PRLV SEPA SPOTIFY AB 12/06",
      booking_date: "2026-06-14",
    }),
    tx({
      id: "tx-2",
      amount: -11.12,
      description: "PRLV SEPA SPOTIFY AB 12/07",
      booking_date: "2026-07-16",
    }),
    tx({
      id: "tx-3",
      amount: -11.12,
      description: "PRLV SEPA SPOTIFY AB 12/08",
      booking_date: "2026-08-13",
    }),
  ];

  it("links every past transaction with the same label and amount", () => {
    expect(
      history.filter((entry) => matchesRecurringPayment(entry, manualRule)),
    ).toHaveLength(3);
  });

  it("ignores a different merchant at the same amount", () => {
    const other = tx({
      id: "tx-4",
      amount: -11.12,
      description: "PRLV SEPA DEEZER 12/08",
      booking_date: "2026-08-13",
    });

    expect(matchesRecurringPayment(other, manualRule)).toBe(false);
  });
});

describe("buildMonthlySubscriptionOverview with merged rules", () => {
  it("reports a single continuous subscription across both labels", () => {
    const transactions = [
      tx({
        id: "tx-1",
        amount: -13.49,
        description: "PRELEVEMENT PAYPAL EUROPE SARL",
        booking_date: "2026-06-05",
        recurring_payment_id: "netflix-paypal",
      }),
      tx({
        id: "tx-2",
        amount: -13.49,
        description: "PRELEVEMENT PAYPAL EUROPE SARL",
        booking_date: "2026-07-05",
        recurring_payment_id: "netflix-paypal",
      }),
      tx({
        id: "tx-3",
        amount: -13.49,
        description: "PRLV SEPA NETFLIX INTERNATIONAL",
        booking_date: "2026-08-05",
        recurring_payment_id: "netflix",
      }),
    ];

    const overview = buildMonthlySubscriptionOverview(
      transactions,
      [NETFLIX, NETFLIX_PAYPAL],
      "fr",
    );
    const relevant = overview.filter((row) =>
      ["2026-06", "2026-07", "2026-08"].includes(row.monthKey),
    );

    expect(relevant).toHaveLength(3);
    for (const row of relevant) {
      expect(row.items).toHaveLength(1);
      expect(row.items[0].id).toBe("netflix");
      expect(row.items[0].name).toBe("Netflix");
      expect(row.total).toBe(13.49);
    }
  });
});

describe("listActiveSubscriptions with merged rules", () => {
  const reference = new Date("2026-08-20T00:00:00Z");

  it("lists the service once and prices it from the most recent variant", () => {
    const raised = { ...NETFLIX, amount: 15.49 };
    const transactions = [
      tx({
        id: "tx-1",
        amount: -13.49,
        description: "PRELEVEMENT PAYPAL EUROPE SARL",
        booking_date: "2026-07-05",
        recurring_payment_id: "netflix-paypal",
      }),
      tx({
        id: "tx-2",
        amount: -15.49,
        description: "PRLV SEPA NETFLIX INTERNATIONAL",
        booking_date: "2026-08-05",
        recurring_payment_id: "netflix",
      }),
    ];

    const active = listActiveSubscriptions(
      transactions,
      [raised, NETFLIX_PAYPAL],
      "fr",
      reference,
    );

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("netflix");
    expect(active[0].billingAmount).toBe(15.49);
  });

  it("keeps the service active when only the archived variant was paid recently", () => {
    const transactions = [
      tx({
        id: "tx-1",
        amount: -13.49,
        description: "PRELEVEMENT PAYPAL EUROPE SARL",
        booking_date: "2026-07-05",
        recurring_payment_id: "netflix-paypal",
      }),
    ];

    const active = listActiveSubscriptions(
      transactions,
      [NETFLIX, NETFLIX_PAYPAL],
      "fr",
      reference,
    );

    expect(active.map((row) => row.id)).toEqual(["netflix"]);
    expect(active[0].billingAmount).toBe(13.49);
  });

  it("exposes min–max monthly amounts for flexible subscriptions", () => {
    const edf = rule({
      id: "edf",
      name: "Electricite De France Pascal Jerome",
      amount: 96.91,
      amount_flexible: true,
      description_pattern: "ELECTRICITE DE FRANCE",
    });
    const transactions = [
      tx({
        id: "tx-edf-1",
        amount: -96.91,
        description: "PRLV SEPA ELECTRICITE DE FRANCE",
        booking_date: "2026-06-10",
        recurring_payment_id: "edf",
      }),
      tx({
        id: "tx-edf-2",
        amount: -150,
        description: "PRLV SEPA ELECTRICITE DE FRANCE",
        booking_date: "2026-07-10",
        recurring_payment_id: "edf",
      }),
      tx({
        id: "tx-edf-3",
        amount: -120.5,
        description: "PRLV SEPA ELECTRICITE DE FRANCE",
        booking_date: "2026-08-10",
        recurring_payment_id: "edf",
      }),
    ];

    const active = listActiveSubscriptions(transactions, [edf], "fr", reference);

    expect(active).toHaveLength(1);
    expect(active[0].amountFlexible).toBe(true);
    expect(active[0].monthlyAmountMin).toBe(96.91);
    expect(active[0].monthlyAmountMax).toBe(150);
    expect(active[0].monthlyAmount).toBe(120.5);
  });

  it("keeps semi-annual water bills active and spreads amount over 6 months", () => {
    const water = rule({
      id: "eau",
      name: "Eau Assmt Cacg",
      amount: 85.23,
      amount_flexible: true,
      cadence: "semiannual",
      description_pattern: "EAU ASSMT CACG",
    });
    const transactions = [
      tx({
        id: "tx-eau-1",
        amount: -98.19,
        description: "PAIEMENT PAR CARTE X5947 EAU ASSMT CACG 46 CA 04/11",
        booking_date: "2025-11-05",
        recurring_payment_id: "eau",
      }),
      tx({
        id: "tx-eau-2",
        amount: -85.23,
        description: "PAIEMENT PAR CARTE X5947 EAU ASSMT CACG 46 CA 21/05",
        booking_date: "2026-05-22",
        recurring_payment_id: "eau",
      }),
    ];

    const active = listActiveSubscriptions(transactions, [water], "fr", reference);

    expect(active).toHaveLength(1);
    expect(active[0].cadence).toBe("semiannual");
    expect(active[0].billingAmountMin).toBe(85.23);
    expect(active[0].billingAmountMax).toBe(98.19);
    expect(active[0].monthlyAmountMin).toBe(14.21);
    expect(active[0].monthlyAmountMax).toBe(16.36);
    expect(active[0].monthlyAmount).toBe(14.21);
  });
});

describe("inferCadenceFromPaymentDates", () => {
  it("detects semi-annual gaps around six months", async () => {
    const { inferCadenceFromPaymentDates } = await import("./recurring-payments");
    expect(
      inferCadenceFromPaymentDates(["2025-11-05", "2026-05-22"]),
    ).toBe("semiannual");
  });
});

describe("assignRecurringPayments", () => {
  const apple = (id: string, day: number) =>
    rule({
      id,
      name: "Apple Cork",
      amount: 9.99,
      description_pattern: "APPLE CORK",
      billing_day: day,
    });

  const charge = (id: string, date: string) =>
    tx({
      id,
      amount: -9.99,
      description: `PAIEMENT PAR CARTE X0745 APPLE CORK ${date.slice(8)}/09`,
      booking_date: date,
    });

  it("gives each subscription its own charge when two share a label", () => {
    const transactions = [
      charge("tx-18", "2026-09-21"),
      charge("tx-21", "2026-09-22"),
    ];
    const assignment = assignRecurringPayments(transactions, [
      apple("apple-a", 21),
      apple("apple-b", 22),
    ]);

    expect(assignment.get("tx-18")).toBe("apple-a");
    expect(assignment.get("tx-21")).toBe("apple-b");
  });

  it("leaves the second charge of a month free rather than doubling one up", () => {
    const assignment = assignRecurringPayments(
      [charge("tx-18", "2026-09-21"), charge("tx-21", "2026-09-22")],
      [apple("apple-a", 21)],
    );

    expect(assignment.get("tx-18")).toBe("apple-a");
    expect(assignment.get("tx-21")).toBeNull();
  });

  it("repeats the split month after month", () => {
    const assignment = assignRecurringPayments(
      [
        charge("sept-a", "2026-09-21"),
        charge("sept-b", "2026-09-22"),
        charge("oct-a", "2026-10-21"),
        charge("oct-b", "2026-10-22"),
      ],
      [apple("apple-a", 21), apple("apple-b", 22)],
    );

    expect(assignment.get("sept-a")).toBe("apple-a");
    expect(assignment.get("oct-a")).toBe("apple-a");
    expect(assignment.get("sept-b")).toBe("apple-b");
    expect(assignment.get("oct-b")).toBe("apple-b");
  });

  it("keeps no monthly quota on a yearly subscription", () => {
    const yearly = rule({
      id: "insurance",
      name: "Assurance",
      amount: 120,
      description_pattern: "ASSURANCE",
      cadence: "yearly",
      billing_month: 9,
      billing_day: 10,
    });
    const transactions = [
      tx({
        id: "tx-1",
        amount: -120,
        description: "PRLV SEPA ASSURANCE",
        booking_date: "2026-09-10",
      }),
      tx({
        id: "tx-2",
        amount: -120,
        description: "PRLV SEPA ASSURANCE",
        booking_date: "2026-09-12",
      }),
    ];

    const assignment = assignRecurringPayments(transactions, [yearly]);
    expect(assignment.get("tx-1")).toBe("insurance");
    expect(assignment.get("tx-2")).toBe("insurance");
  });
});
