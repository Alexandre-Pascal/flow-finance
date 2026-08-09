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
    expect(settings.trackedPerson.label).toBe("Sophie");
  });
});
