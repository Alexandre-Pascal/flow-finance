import { describe, expect, it } from "vitest";
import {
  descriptionMatchesGeneralPattern,
  generalRecurringMatchPattern,
  recurringGroupKey,
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
});
