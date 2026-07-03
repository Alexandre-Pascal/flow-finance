import { describe, expect, it } from "vitest";
import { buildVehicle } from "./savings";
import type { SavingsAccount, TransactionWithAccount } from "@/types/database";

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const monthFullFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

const account: SavingsAccount = {
  id: "sav-1",
  user_id: "user-1",
  name: "Livret A",
  kind: "livret_a",
  color: "#CA8A04",
  base_balance: 1000,
  base_date: "2025-06-15",
  interest_rate: null,
  ceiling: null,
  opening_date: null,
  deposit_keywords: [],
  withdrawal_keywords: [],
  created_at: "2025-06-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
};

function transfer(amount: number, date: string): TransactionWithAccount {
  return {
    id: `tx-${date}`,
    account_id: "acc-1",
    entry_reference: `ref-${date}`,
    booking_date: date,
    amount: -amount,
    currency: "EUR",
    description: "VIREMENT EMIS WEB",
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
    account_name: "Compte courant",
    account_type: "checking",
    savings_transfer: {
      account_id: "sav-1",
      account_name: "Livret A",
      direction: "deposit",
    },
  };
}

describe("buildVehicle", () => {
  it("recalculates balance from anchor and later deposits", () => {
    const vehicle = buildVehicle(
      account,
      [transfer(200, "2025-07-10")],
      [],
      monthFormatter,
      monthFullFormatter,
      new Date("2025-08-01T12:00:00Z"),
    );

    expect(vehicle.balance).toBe(1200);
  });
});
