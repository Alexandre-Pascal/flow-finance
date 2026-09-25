/**
 * @file transaction-mapping.test.ts
 * @description Garde-fou sur la lecture des transactions : une annotation
 * persistée qui n'est ni sélectionnée ni recopiée disparaît en silence. Le
 * rattachement manuel d'un virement s'écrivait bien en base et n'avait
 * strictement aucun effet, faute de revenir avec la ligne.
 */

import { describe, expect, it } from "vitest";
import { TRANSACTION_COLUMNS, mapTransaction } from "@/lib/finance/queries";
import type { Account } from "@/types/database";

/** Colonnes qui portent un choix de l'utilisateur : les perdre le trahit. */
const ANNOTATION_COLUMNS = [
  "category_id",
  "category_manual",
  "recurring_payment_id",
  "recurring_payment_manual",
  "savings_account_id",
  "savings_account_manual",
  "pea_plan_id",
  "pea_manual",
  "income_source",
  "transfer_account_id",
  "transfer_manual",
  "note",
];

const account: Account = {
  id: "acc-1",
  user_id: "user-1",
  connection_id: null,
  external_uid: "ext-1",
  name: "M. PASCAL ALEXANDRE",
  display_name: "Compte courant",
  iban: null,
  type: "checking",
  balance: 100,
  currency: "EUR",
  last_transactions_synced_at: null,
  space_id: "space-perso",
  match_keywords: [],
  base_balance: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("lecture des transactions", () => {
  it("sélectionne toutes les colonnes d'annotation", () => {
    const selected = TRANSACTION_COLUMNS.split(", ");
    for (const column of ANNOTATION_COLUMNS) {
      expect(selected).toContain(column);
    }
  });

  it("recopie le rattachement manuel d'un virement", () => {
    const tx = mapTransaction(
      {
        id: "tx-1",
        account_id: "acc-1",
        entry_reference: "ref-1",
        booking_date: "2026-09-23",
        amount: -122,
        currency: "EUR",
        description: "VIREMENT EMIS VIR INST vers ALEXANDRE JULIEN P",
        status: "booked",
        transfer_account_id: "acc-2",
        transfer_manual: true,
        created_at: "2026-09-23T00:00:00.000Z",
        updated_at: "2026-09-23T00:00:00.000Z",
      },
      account,
    );

    expect(tx.transfer_account_id).toBe("acc-2");
    expect(tx.transfer_manual).toBe(true);
  });

  it("laisse la détection automatique reprendre la main", () => {
    const tx = mapTransaction(
      {
        id: "tx-2",
        account_id: "acc-1",
        entry_reference: "ref-2",
        booking_date: "2026-09-23",
        amount: -12,
        currency: "EUR",
        description: "To EUR",
        status: "booked",
        transfer_account_id: null,
        transfer_manual: false,
        created_at: "2026-09-23T00:00:00.000Z",
        updated_at: "2026-09-23T00:00:00.000Z",
      },
      account,
    );

    expect(tx.transfer_account_id).toBeNull();
    expect(tx.transfer_manual).toBe(false);
  });
});
