import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_SETTINGS,
  normalizeProfileSettings,
} from "./profile-settings";

describe("normalizeProfileSettings", () => {
  it("returns mode A defaults for empty input", () => {
    expect(normalizeProfileSettings({})).toEqual(DEFAULT_PROFILE_SETTINGS);
  });

  it("keeps module toggles and trims keywords", () => {
    const settings = normalizeProfileSettings({
      modules: { savings: false, investments: true },
      payroll: { keyword: "  CYFYN  ", budgetShiftMonths: 0 },
      trackedPerson: { keyword: "PASCAL SOPHIE", label: " Sophie " },
    });

    expect(settings.modules.savings).toBe(false);
    expect(settings.modules.investments).toBe(true);
    expect(settings.modules.payroll).toBe(true);
    expect(settings.payroll.keyword).toBe("CYFYN");
    expect(settings.payroll.budgetShiftMonths).toBe(0);
    expect(settings.trackedIncomeSources).toEqual([
      {
        id: "sophie-pascal-sophie-0",
        label: "Sophie",
        keywords: ["PASCAL SOPHIE"],
        excludeKeywords: [],
        requireRoundAmount: true,
      },
    ]);
    expect(settings.trackedPerson.label).toBe("Sophie");
    expect(settings.trackedPerson.keyword).toBe("PASCAL SOPHIE");
  });

  it("normalizes multiple outgoing recipients in parallel", () => {
    const settings = normalizeProfileSettings({
      modules: { trackedOutgoing: true },
      trackedOutgoingPeople: [
        { label: " Alexandre ", keyword: " PASCAL ALEXANDRE " },
        { id: "julie", label: "Julie", keyword: "PASCAL JULIE" },
        { label: "Skip", keyword: "   " },
      ],
    });

    expect(settings.modules.trackedOutgoing).toBe(true);
    expect(settings.trackedOutgoingPeople).toEqual([
      {
        id: "alexandre-pascal-alexandre-0",
        label: "Alexandre",
        keyword: "PASCAL ALEXANDRE",
      },
      { id: "julie", label: "Julie", keyword: "PASCAL JULIE" },
    ]);
  });

  it("normalizes multiple income sources with keywords and exclusions", () => {
    const settings = normalizeProfileSettings({
      modules: { trackedPerson: true },
      trackedIncomeSources: [
        {
          label: " Sophie ",
          keywords: ["PASCAL SOPHIE", "MME PASCAL SOPHIE"],
          excludeKeywords: [" ALUTEC "],
          requireRoundAmount: true,
        },
      ],
    });

    expect(settings.trackedIncomeSources).toEqual([
      {
        id: expect.stringMatching(/^sophie-/),
        label: "Sophie",
        keywords: ["PASCAL SOPHIE", "MME PASCAL SOPHIE"],
        excludeKeywords: ["ALUTEC"],
        requireRoundAmount: true,
      },
    ]);
  });
});
