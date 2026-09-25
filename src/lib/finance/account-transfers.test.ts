import { describe, expect, it } from "vitest";
import {
  annotateAccountTransfers,
  holderTokens,
  matchAccountTransfer,
} from "./account-transfers";
import type { Account, TransactionWithAccount } from "@/types/database";

function account(id: string, name: string): Account {
  return {
    id,
    user_id: "user-1",
    connection_id: null,
    external_uid: null,
    name,
    iban: null,
    type: "checking",
    balance: 0,
    currency: "EUR",
    last_transactions_synced_at: null,
    created_at: "",
    updated_at: "",
  };
}

const ca = account("ca", "M. PASCAL ALEXANDRE");
const revolut = account("revolut", "Alexandre Pascal");
const joint = account("joint", "ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE");
const accounts = [ca, revolut, joint];

function tx(
  accountId: string,
  description: string,
  amount: number,
  extra: Partial<TransactionWithAccount> = {},
): TransactionWithAccount {
  return {
    id: `tx-${description.slice(0, 8)}-${amount}`,
    account_id: accountId,
    entry_reference: "ref",
    booking_date: "2026-09-20",
    amount,
    currency: "EUR",
    description,
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: "",
    updated_at: "",
    account_name: "Compte",
    account_type: "checking",
    ...extra,
  };
}

describe("matchAccountTransfer", () => {
  it("names the counterpart when the label is more precise than the holder", () => {
    // Le libellé nomme les deux titulaires du compte joint : six fragments
    // contre deux pour le compte qui porte la ligne.
    expect(
      matchAccountTransfer(
        tx("revolut", "To ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE", -1),
        accounts,
      ),
    ).toEqual({ kind: "counterpart", account: joint });
  });

  it("says only « chez moi » when the label repeats the holder", () => {
    // Sur le Crédit Agricole, 67 virements reçus portent ce libellé alors que
    // Revolut n'a presque rien envoyé : désigner un compte serait inventer.
    expect(
      matchAccountTransfer(
        tx("ca", "VIREMENT EN VOTRE FAVEUR DE M. PASCAL ALEXANDRE", 500),
        accounts,
      ),
    ).toEqual({ kind: "self" });

    expect(
      matchAccountTransfer(
        tx("ca", "VIREMENT EMIS WEB M. PASCAL ALEXANDRE", -300),
        accounts,
      ),
    ).toEqual({ kind: "self" });
  });

  it("does not mistake relatives for the account holder", () => {
    // La mère et le père partagent le nom de famille, jamais le prénom.
    expect(
      matchAccountTransfer(
        tx("ca", "VIREMENT EN VOTRE FAVEUR VIR INST de PASCAL SOPHIE", 200),
        accounts,
      ),
    ).toBeNull();
    expect(
      matchAccountTransfer(
        tx("ca", "VIREMENT EN VOTRE FAVEUR PASCAL JEROME", 45),
        accounts,
      ),
    ).toBeNull();
  });

  it("stays out of the way when the label names nobody", () => {
    expect(matchAccountTransfer(tx("revolut", "To EUR", -147), accounts)).toBeNull();
    expect(
      matchAccountTransfer(
        tx("ca", "PAIEMENT PAR CARTE X0745 LIDL CASTEL", -14.76),
        accounts,
      ),
    ).toBeNull();
  });
});

describe("annotateAccountTransfers", () => {
  it("reads the direction from the account carrying the line", () => {
    const [out, incoming] = annotateAccountTransfers(
      [
        tx("revolut", "To ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE", -1),
        tx("joint", "From ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE", 1),
      ],
      accounts,
    );

    expect(out.account_transfer).toEqual({
      counterpart_account_id: "joint",
      counterpart_account_name: joint.name,
      direction: "out",
    });
    // Sur le compte joint lui-même, le libellé ne désigne que son titulaire.
    expect(incoming.account_transfer).toEqual({
      counterpart_account_id: null,
      counterpart_account_name: null,
      direction: "in",
    });
  });

  it("neutralises a self-transfer without naming a counterpart", () => {
    const [row] = annotateAccountTransfers(
      [tx("ca", "VIREMENT EN VOTRE FAVEUR DE M. PASCAL ALEXANDRE", 500)],
      accounts,
    );

    expect(row.account_transfer).toEqual({
      counterpart_account_id: null,
      counterpart_account_name: null,
      direction: "in",
    });
  });

  it("lets a manual attachment win over the label", () => {
    const [row] = annotateAccountTransfers(
      [
        tx("ca", "To EUR", -147, {
          transfer_manual: true,
          transfer_account_id: "joint",
        }),
      ],
      accounts,
    );

    expect(row.account_transfer?.counterpart_account_id).toBe("joint");
  });

  it("lets a manual detachment silence the label", () => {
    const [row] = annotateAccountTransfers(
      [
        tx("ca", "VIREMENT EMIS WEB M. PASCAL ALEXANDRE", -300, {
          transfer_manual: true,
          transfer_account_id: null,
        }),
      ],
      accounts,
    );

    expect(row.account_transfer).toBeNull();
  });

  it("leaves a savings transfer to its own qualification", () => {
    // « Epargne maison » nomme aussi le titulaire : sans garde-fou, le
    // versement sur le livret passerait pour un simple déplacement de compte.
    const [row] = annotateAccountTransfers(
      [
        tx("ca", "VIREMENT EMIS WEB M. PASCAL ALEXANDRE Epargne maison", -1000, {
          savings_transfer: {
            account_id: "ldd",
            account_name: "LDD Solidaire",
            direction: "deposit",
          },
        }),
      ],
      accounts,
    );

    expect(row.account_transfer).toBeNull();
    expect(row.savings_transfer?.account_name).toBe("LDD Solidaire");
  });
});

describe("holderTokens", () => {
  it("drops civilities, accents and one-letter fragments", () => {
    expect(holderTokens("M. PASCAL ALEXANDRE")).toEqual(["PASCAL", "ALEXANDRE"]);
    expect(holderTokens("ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE")).toEqual([
      "ALEXANDRE",
      "JULIEN",
      "PASCAL",
      "ANAIS",
      "ALICIA",
      "LACOMBE",
    ]);
  });
});
