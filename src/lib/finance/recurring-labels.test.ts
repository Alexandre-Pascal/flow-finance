import { describe, expect, it } from "vitest";
import {
  descriptionMatchesGeneralPattern,
  generalRecurringMatchPattern,
  recurringGroupKey,
  resolveGeneralStoredPattern,
} from "./recurring-labels";

describe("recurring label normalization", () => {
  it("strips AXA contract / invoice ids from the pattern", () => {
    const a =
      "PRELEVEMENT AXA FRANCE VIE SA I0000977895043-CONTRAT0000001761454804 I0000977895043 ++AX000000000002420309 FR14ZZZ391832";
    const b =
      "PRELEVEMENT AXA FRANCE VIE SA I0000969591661-CONTRAT0000001761454804 I0000969591661 ++AX000000000002420309 FR14ZZZ391832";

    expect(recurringGroupKey(a)).toBe("AXA FRANCE VIE SA");
    expect(recurringGroupKey(b)).toBe("AXA FRANCE VIE SA");
    expect(generalRecurringMatchPattern(recurringGroupKey(a))).toBe(
      "AXA FRANCE VIE SA",
    );
    expect(
      descriptionMatchesGeneralPattern(
        b,
        "AXA FRANCE VIE SA I0000977895043",
      ),
    ).toBe(true);
  });

  it("still groups Free Mobile invoice variants", () => {
    const a =
      "PRELEVEMENT FREE MOBILE fmpmt-2441268385 ++FM-12189729-1 FR07ZZZ591778";
    const b =
      "PRELEVEMENT FREE MOBILE fmpmt-2425519539 ++FM-12189729-1 FR07ZZZ591778";

    expect(recurringGroupKey(a)).toBe(recurringGroupKey(b));
    expect(
      descriptionMatchesGeneralPattern(b, generalRecurringMatchPattern(recurringGroupKey(a))),
    ).toBe(true);
  });

  it("matches water bills even when a short code sits between pattern tokens", () => {
    const may =
      "PAIEMENT PAR CARTE X5947 EAU ASSMT CACG 46 CA 21/05";
    const november =
      "PAIEMENT PAR CARTE X5947 EAU ASSMT CACG 46 CA 04/11";

    const pattern = generalRecurringMatchPattern(recurringGroupKey(may));
    expect(pattern).toBe("EAU ASSMT CACG CA");
    expect(descriptionMatchesGeneralPattern(may, pattern)).toBe(true);
    expect(descriptionMatchesGeneralPattern(november, pattern)).toBe(true);
  });

  it("lets a manual override shorten an overly broad detected pattern", () => {
    const description =
      "VIREMENT EMIS WEB Anais Lacombe participation basic fit";

    expect(resolveGeneralStoredPattern(description)).toBe(
      "VIREMENT EMIS WEB ANAIS LACOMBE",
    );
    expect(resolveGeneralStoredPattern(description, "ANAIS LACOMBE")).toBe(
      "ANAIS LACOMBE",
    );
    expect(
      descriptionMatchesGeneralPattern(description, "ANAIS LACOMBE"),
    ).toBe(true);
  });

  it("normalizes a hand-typed pattern and still matches the bank label", () => {
    const pattern = generalRecurringMatchPattern("basic fit 000123456");

    expect(pattern).toBe("BASIC FIT");
    expect(
      descriptionMatchesGeneralPattern(
        "PAIEMENT PAR CARTE X1234 BASIC FIT 000123456",
        pattern,
      ),
    ).toBe(true);
  });
});
