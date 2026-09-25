import { describe, expect, it } from "vitest";
import { buildCheckingOverview, buildVehicle } from "./savings";
import type {
  Account,
  SavingsAccount,
  TransactionWithAccount,
} from "@/types/database";

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

  it("ignores deposits before anchor date in the same month", () => {
    const vehicle = buildVehicle(
      account,
      [transfer(50, "2025-06-10"), transfer(100, "2025-06-20")],
      [],
      monthFormatter,
      monthFullFormatter,
      new Date("2025-08-01T12:00:00Z"),
    );

    expect(vehicle.balance).toBe(1100);
  });

  it("matches user example: anchor 1627.77 on 2026-06-15 plus 100 after", () => {
    const juneAccount: SavingsAccount = {
      ...account,
      base_balance: 1627.77,
      base_date: "2026-06-15",
    };
    const vehicle = buildVehicle(
      juneAccount,
      [transfer(100, "2026-06-20")],
      [],
      monthFormatter,
      monthFullFormatter,
      new Date("2026-06-25T12:00:00Z"),
    );

    expect(vehicle.balance).toBe(1727.77);
  });
});

describe("buildCheckingOverview — pockets", () => {
  const pocket: Account = {
    id: "pocket",
    user_id: "user-1",
    connection_id: null,
    external_uid: null,
    name: "Paris",
    iban: null,
    type: "checking",
    balance: 72,
    currency: "EUR",
    last_transactions_synced_at: null,
    space_id: "partage",
    match_keywords: ["MB:cb78bfe2"],
    base_balance: 0,
    created_at: "",
    updated_at: "",
  };

  function transfer(
    id: string,
    amount: number,
    date: string,
  ): TransactionWithAccount {
    return {
      id,
      account_id: "joint",
      entry_reference: `ref-${id}`,
      booking_date: date,
      amount,
      currency: "EUR",
      description: `To EUR MB:cb78bfe2 ${id}`,
      status: "BOOK",
      category_id: null,
      category_manual: false,
      recurring_payment_id: null,
      recurring_payment_manual: false,
      note: null,
      created_at: "",
      updated_at: "",
      account_name: "Compte joint",
      account_type: "checking",
      account_transfer: {
        counterpart_account_id: "pocket",
        counterpart_account_name: "Paris",
        direction: amount < 0 ? "out" : "in",
        counterpart_space_id: "partage",
        same_space: true,
      },
    };
  }

  it("reads the transfers that designate the pocket, seen from the pocket", () => {
    const today = new Date().toISOString().slice(0, 10);
    const [vehicle] = buildCheckingOverview(
      [pocket],
      // La ligne vit sur le compte joint : une sortie de 72 € y est une
      // entrée de 72 € dans la pocket.
      [transfer("tx-1", -72, today), transfer("tx-2", 20, today)],
      "fr",
    );

    expect(vehicle.movements.map((movement) => movement.amount)).toEqual([
      72, -20,
    ]);
    expect(vehicle.monthly.at(-1)?.deposits).toBe(72);
    expect(vehicle.monthly.at(-1)?.withdrawals).toBe(20);
  });
});
