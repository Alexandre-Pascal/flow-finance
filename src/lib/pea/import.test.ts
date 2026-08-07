import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parsePeaImportFile } from "@/lib/pea/import";

const SAMPLE_FR = `Date;Type;ISIN;Nom;Quantité;Montant;ID
2026-07-01;Achat;LU1681043599;Amundi MSCI World;0.28;200,00;ord-1
2026-07-01;Versement;;;0;200,00;dep-1
2026-08-01;Achat;LU1681043599;Amundi MSCI World;0.27;200,00;ord-2
`;

const SAMPLE_TR_OFFICIAL = `"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"
"2026-08-03T07:02:21.675399Z","2026-08-03","DEFAULT","CASH","TRANSFER_INBOUND","","M.       PASCAL ALEXANDRE","","","","200.000000","","","EUR","","","","Incoming transfer from M.       PASCAL ALEXANDRE","019fc66e-3eeb-7fdf-a557-bc3ae639026a","M.       PASCAL ALEXANDRE","FR7611206000290062950507558","",""
"2026-08-03T08:41:50.240Z","2026-08-03","PEA","TRADING","BUY","FUND","MSCI World Swap PEA EUR (Acc)","IE0002XZSHO1","29.0000000000","6.8720000000","-199.29","","","EUR","","","","Savings plan execution IE0002XZSHO1 iShares VI plc - iShares MSCI World Swap PEA UCITS ETF EUR (Acc), quantity: 29","bc61185b-c4f5-4eb0-8e3a-984428bd1bb5","","","",""
"2026-08-03T09:01:18.108709Z","2026-08-03","DEFAULT","CASH","TRANSFER_OUT","","","","","","-198.290000","","","EUR","","","","Versement PEA","019fc6db-239c-7e2f-ad92-dcab4cbccbd1","","","",""
"2026-08-03T09:01:18.138239Z","2026-08-03","PEA","CASH","TRANSFER_IN","","","","","","198.290000","","","EUR","","","","Versement PEA","019fc6db-23ba-747a-ba51-2dea46fe65c1","","","",""
`;

describe("parsePeaImportFile", () => {
  it("parse un export Trade Republic FR et reconstruit les positions", () => {
    const result = parsePeaImportFile(SAMPLE_FR);
    expect(result.rows).toHaveLength(3);
    expect(result.periodStart).toBe("2026-07-01");
    expect(result.periodEnd).toBe("2026-08-01");
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      isin: "LU1681043599",
      quantity: 0.55,
      costBasisEur: 400,
    });
  });

  it("parse l'export officiel TR : filtre PEA, ISIN via symbol, parts entières", () => {
    const result = parsePeaImportFile(SAMPLE_TR_OFFICIAL);

    expect(result.rows).toHaveLength(2);
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "buy",
          isin: "IE0002XZSHO1",
          name: "MSCI World Swap PEA EUR (Acc)",
          quantity: 29,
          amountEur: 199.29,
          externalRef: "tr:bc61185b-c4f5-4eb0-8e3a-984428bd1bb5",
        }),
        expect.objectContaining({
          kind: "deposit",
          isin: null,
          amountEur: 198.29,
          externalRef: "tr:019fc6db-23ba-747a-ba51-2dea46fe65c1",
        }),
      ]),
    );

    expect(result.positions).toEqual([
      {
        isin: "IE0002XZSHO1",
        name: "MSCI World Swap PEA EUR (Acc)",
        quantity: 29,
        costBasisEur: 199.29,
      },
    ]);
  });

  it("parse le fichier d'export réel téléchargé", () => {
    const content = readFileSync(
      "/Users/alexandre-pascal/Downloads/Exportation de transactions 3.csv",
      "utf8",
    );
    const result = parsePeaImportFile(content);
    expect(result.positions[0]).toMatchObject({
      isin: "IE0002XZSHO1",
      quantity: 29,
      costBasisEur: 199.29,
    });
  });
});
