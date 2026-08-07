import { describe, expect, it } from "vitest";
import {
  annotatePeaTransfers,
  isInternalTransfer,
  matchPeaTransfer,
} from "@/lib/pea/transfers";
import type {
  PeaHolding,
  PeaInvestmentPlan,
  TransactionWithAccount,
} from "@/types/database";

const holding: PeaHolding = {
  id: "hold-1",
  user_id: "user-1",
  isin: "LU1681043599",
  ticker: "CW8.PA",
  name: "Amundi MSCI World",
  quantity: 0,
  cost_basis_eur: 0,
  manual_price_eur: null,
  created_at: "",
  updated_at: "",
};

const plan: PeaInvestmentPlan = {
  id: "plan-1",
  user_id: "user-1",
  label: "DCA ETF monde",
  keywords: ["200 euros ETF monde"],
  holding_id: holding.id,
  expected_amount_eur: 200,
  active: true,
  created_at: "",
  updated_at: "",
};

function tx(partial: Partial<TransactionWithAccount>): TransactionWithAccount {
  return {
    id: "tx-1",
    account_id: "acc-1",
    entry_reference: "ref",
    booking_date: "2026-08-01",
    amount: -200,
    currency: "EUR",
    description: "VIR SEPA 200 euros ETF monde Trade Republic",
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

describe("matchPeaTransfer", () => {
  it("détecte le libellé contenant 200 euros ETF monde", () => {
    expect(matchPeaTransfer(tx({}), [plan])?.id).toBe("plan-1");
  });

  it("ignore les plans inactifs", () => {
    expect(matchPeaTransfer(tx({}), [{ ...plan, active: false }])).toBeNull();
  });
});

describe("annotatePeaTransfers", () => {
  it("annote le virement et le marque comme transfert interne", () => {
    const [annotated] = annotatePeaTransfers([tx({})], [plan], [holding]);
    expect(annotated.pea_transfer).toEqual({
      plan_id: "plan-1",
      plan_label: "DCA ETF monde",
      holding_id: "hold-1",
      holding_name: "Amundi MSCI World",
      direction: "deposit",
    });
    expect(isInternalTransfer(annotated)).toBe(true);
  });

  it("priorise l'affectation manuelle sur les mots-clés", () => {
    const other: PeaInvestmentPlan = {
      ...plan,
      id: "plan-2",
      label: "Autre plan",
      keywords: ["autre"],
    };
    const [annotated] = annotatePeaTransfers(
      [
        tx({
          description: "VIR SEPA 200 euros ETF monde",
          pea_manual: true,
          pea_plan_id: "plan-2",
        }),
      ],
      [plan, other],
      [holding],
    );
    expect(annotated.pea_transfer?.plan_id).toBe("plan-2");
  });
});
