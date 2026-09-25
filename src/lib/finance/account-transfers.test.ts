import { describe, expect, it } from "vitest";
import {
  annotateAccountTransfers,
  holderTokens,
  isCrossSpaceTransfer,
  isNeutralTransfer,
  matchAccountTransfer,
  suggestTransferKeyword,
  withManualBalances,
} from "./account-transfers";
import type { Account, Space, TransactionWithAccount } from "@/types/database";

function space(id: string, kind: Space["kind"]): Space {
  return {
    id,
    user_id: "user-1",
    name: id,
    kind,
    color: "#000000",
    position: kind === "personal" ? 0 : 1,
    created_at: "",
    updated_at: "",
  };
}

const perso = space("perso", "personal");
const partage = space("partage", "shared");
const spaces = [perso, partage];

function account(id: string, name: string, spaceId = "perso"): Account {
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
    space_id: spaceId,
    created_at: "",
    updated_at: "",
  };
}

const ca = account("ca", "M. PASCAL ALEXANDRE");
const revolut = account("revolut", "Alexandre Pascal");
const joint = account(
  "joint",
  "ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE",
  "partage",
);
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
      counterpart_space_id: "partage",
      same_space: false,
    });
    // Sur le compte joint lui-même, le libellé ne désigne que son titulaire.
    expect(incoming.account_transfer).toEqual({
      counterpart_account_id: null,
      counterpart_account_name: null,
      direction: "in",
      counterpart_space_id: null,
      same_space: true,
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
      counterpart_space_id: null,
      same_space: true,
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

describe("virements et espaces", () => {
  it("neutralises a move inside one space", () => {
    const [row] = annotateAccountTransfers(
      [tx("ca", "VIREMENT EN VOTRE FAVEUR DE M. PASCAL ALEXANDRE", 500)],
      accounts,
      spaces,
    );

    expect(row.account_transfer?.same_space).toBe(true);
    expect(isNeutralTransfer(row)).toBe(true);
    expect(isCrossSpaceTransfer(row)).toBe(false);
  });

  it("counts a move to the shared space as a real expense", () => {
    const [row] = annotateAccountTransfers(
      [tx("revolut", "To ALEXANDRE JULIEN PASCAL & ANAÏS ALICIA LACOMBE", -100)],
      accounts,
      spaces,
    );

    expect(row.account_transfer?.counterpart_space_id).toBe("partage");
    expect(row.account_transfer?.same_space).toBe(false);
    // Une contribution au budget partagé sort bien du budget perso.
    expect(isNeutralTransfer(row)).toBe(false);
    expect(isCrossSpaceTransfer(row)).toBe(true);
  });

  it("treats an unidentified counterpart as staying put", () => {
    // Sans espace connu en face, rien ne prouve que l'argent change de budget.
    const [row] = annotateAccountTransfers(
      [tx("ca", "VIREMENT EMIS WEB M. PASCAL ALEXANDRE", -300)],
      accounts,
      spaces,
    );

    expect(row.account_transfer?.counterpart_space_id).toBeNull();
    expect(isNeutralTransfer(row)).toBe(true);
  });
});

describe("comptes manuels (pockets)", () => {
  const pocket: Account = {
    ...account("pocket", "Pocket vacances", "partage"),
    external_uid: null,
    match_keywords: ["MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73"],
    base_balance: 0,
  };
  const withPocket = [...accounts, pocket];

  it("recognises a pocket by its label fragment", () => {
    // Le libellé commence par une note libre : seul le fragment compte.
    expect(
      matchAccountTransfer(
        tx(
          "joint",
          "Parking + taxe séjour hôtel paris To EUR MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73",
          -72,
        ),
        withPocket,
      ),
    ).toEqual({ kind: "counterpart", account: pocket });
  });

  it("prefers the explicit fragment over the holder's name", () => {
    expect(
      matchAccountTransfer(
        tx(
          "ca",
          "VIREMENT EMIS WEB M. PASCAL ALEXANDRE MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73",
          -50,
        ),
        withPocket,
      ),
    ).toEqual({ kind: "counterpart", account: pocket });
  });

  it("rebuilds the pocket balance from the transfers it receives", () => {
    const annotated = annotateAccountTransfers(
      [
        tx("joint", "To EUR MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73", -72),
        tx("joint", "From EUR MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73", 20),
      ],
      withPocket,
      spaces,
    );

    const [rebuilt] = withManualBalances([pocket], annotated);
    // 72 € mis de côté, 20 € repris.
    expect(rebuilt.balance).toBe(52);
  });

  it("leaves bank accounts' balances alone", () => {
    const [bank] = withManualBalances([ca], []);
    expect(bank.balance).toBe(ca.balance);
  });
});

describe("suggestTransferKeyword", () => {
  it("keeps the stable identifier and drops the free-form note", () => {
    expect(
      suggestTransferKeyword(
        "Parking + taxe séjour hôtel paris To EUR MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73",
      ),
    ).toBe("MB:cb78bfe2-01f6-44a4-959e-ad71b2d5ee73");
  });

  it("falls back to the whole label when there is no identifier", () => {
    expect(suggestTransferKeyword("  To EUR  ")).toBe("To EUR");
  });
});
