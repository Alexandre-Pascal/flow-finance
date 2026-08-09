import { describe, expect, it } from "vitest";
import {
  PEA_ENVELOPE_ID,
  buildContributionFlow,
  sliceContributionFlow,
  sumContributionsByEnvelope,
} from "@/lib/finance/contribution-flow";
import type { SavingsAccount, TransactionWithAccount } from "@/types/database";

const livret: SavingsAccount = {
  id: "livret-1",
  user_id: "user-1",
  name: "Livret A",
  kind: "livret_a",
  color: "#CA8A04",
  base_balance: 0,
  base_date: "2026-01-01",
  interest_rate: null,
  ceiling: null,
  opening_date: null,
  deposit_keywords: ["LIVRET A"],
  withdrawal_keywords: [],
  created_at: "",
  updated_at: "",
};

function tx(
  partial: Partial<TransactionWithAccount> &
    Pick<TransactionWithAccount, "booking_date" | "amount">,
): TransactionWithAccount {
  return {
    id: `tx-${partial.booking_date}-${partial.amount}`,
    account_id: "acc-1",
    entry_reference: "ref",
    currency: "EUR",
    description: "VIR",
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: "",
    updated_at: "",
    account_name: "Courant",
    account_type: "checking",
    ...partial,
  };
}

describe("buildContributionFlow", () => {
  it("agrège les versements livrets et PEA par mois", () => {
    const overview = buildContributionFlow(
      [
        tx({
          booking_date: "2026-07-05",
          amount: -150,
          savings_transfer: {
            account_id: "livret-1",
            account_name: "Livret A",
            direction: "deposit",
          },
        }),
        tx({
          booking_date: "2026-08-03",
          amount: -200,
          pea_transfer: {
            plan_id: "plan-1",
            plan_label: "DCA",
            holding_id: "hold-1",
            holding_name: "MSCI World",
            direction: "deposit",
          },
        }),
        tx({
          booking_date: "2026-08-10",
          amount: -50,
          savings_transfer: {
            account_id: "livret-1",
            account_name: "Livret A",
            direction: "deposit",
          },
        }),
      ],
      [livret],
      "fr",
    );

    expect(overview.hasData).toBe(true);
    const august = overview.months.find((row) => row.monthKey === "2026-08");
    expect(august?.deposits).toBe(250);
    expect(august?.byEnvelope["livret-1"]).toBe(50);
    expect(august?.byEnvelope[PEA_ENVELOPE_ID]).toBe(200);
    expect(august?.net).toBe(250);
  });

  it("soustrait les retraits du net", () => {
    const overview = buildContributionFlow(
      [
        tx({
          booking_date: "2026-08-01",
          amount: -300,
          savings_transfer: {
            account_id: "livret-1",
            account_name: "Livret A",
            direction: "deposit",
          },
        }),
        tx({
          booking_date: "2026-08-15",
          amount: 100,
          savings_transfer: {
            account_id: "livret-1",
            account_name: "Livret A",
            direction: "withdrawal",
          },
        }),
      ],
      [livret],
      "fr",
    );

    const august = overview.months.find((row) => row.monthKey === "2026-08");
    expect(august?.deposits).toBe(300);
    expect(august?.withdrawals).toBe(100);
    expect(august?.net).toBe(200);
    expect(august?.byEnvelope["livret-1"]).toBe(200);
  });

  it("découpe la période demandée", () => {
    const overview = buildContributionFlow(
      [
        tx({
          booking_date: "2026-01-01",
          amount: -100,
          savings_transfer: {
            account_id: "livret-1",
            account_name: "Livret A",
            direction: "deposit",
          },
        }),
      ],
      [livret],
      "fr",
    );

    const sliced = sliceContributionFlow(overview, 3, "fr");
    expect(sliced.months).toHaveLength(3);
  });

  it("résume les totaux par enveloppe", () => {
    const overview = buildContributionFlow(
      [
        tx({
          booking_date: "2026-08-01",
          amount: -200,
          pea_transfer: {
            plan_id: "plan-1",
            plan_label: "DCA",
            holding_id: null,
            holding_name: null,
            direction: "deposit",
          },
        }),
      ],
      [livret],
      "fr",
    );

    const totals = sumContributionsByEnvelope(
      overview.months,
      overview.envelopes,
    );
    expect(totals).toEqual([
      expect.objectContaining({ id: PEA_ENVELOPE_ID, net: 200 }),
    ]);
  });
});
