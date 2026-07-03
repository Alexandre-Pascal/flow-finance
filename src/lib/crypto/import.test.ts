import { describe, expect, it } from "vitest";
import { parseCryptoImportFile } from "./import";

describe("parseCryptoImportFile", () => {
  it("parses tab-separated export", () => {
    const content = `Nom\tAdresse (xpub)\tCrypto\tMontant\tMontant en Euro
Ledger\tzpub123\tBTC\t0.5\t25000
Ledger\tzpub123\tETH\t2\t4000`;

    const rows = parseCryptoImportFile(content);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Ledger",
      xpub: "zpub123",
      symbol: "BTC",
      quantity: 0.5,
      costBasisEur: 25000,
    });
  });

  it("merges duplicate wallet rows", () => {
    const content = `Nom,Adresse (xpub),Crypto,Montant,Montant en Euro
Ledger,zpub123,BTC,0.25,10000
Ledger,zpub123,BTC,0.25,12000`;

    const rows = parseCryptoImportFile(content);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(0.5);
    expect(rows[0].costBasisEur).toBe(22000);
  });
});
