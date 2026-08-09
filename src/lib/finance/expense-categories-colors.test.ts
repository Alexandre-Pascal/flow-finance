import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLOR_PALETTE,
  listSelectableColors,
  normalizeColor,
  pickAvailableColor,
} from "./expense-categories";

describe("pickAvailableColor", () => {
  it("returns the first free palette color", () => {
    expect(pickAvailableColor([])).toBe(CATEGORY_COLOR_PALETTE[0]);
    expect(
      pickAvailableColor([CATEGORY_COLOR_PALETTE[0], CATEGORY_COLOR_PALETTE[1]]),
    ).toBe(CATEGORY_COLOR_PALETTE[2]);
  });

  it("never reuses a taken color when the palette is exhausted", () => {
    const used = CATEGORY_COLOR_PALETTE.map((color) => normalizeColor(color));
    const picked = pickAvailableColor(used);
    expect(used).not.toContain(normalizeColor(picked));
  });

  it("keeps producing unique colors under heavy usage", () => {
    const used: string[] = [];
    for (let index = 0; index < 80; index += 1) {
      const next = pickAvailableColor(used);
      expect(used.map(normalizeColor)).not.toContain(normalizeColor(next));
      used.push(next);
    }
  });
});

describe("listSelectableColors", () => {
  it("keeps enough free swatches when the palette is nearly full", () => {
    const used = CATEGORY_COLOR_PALETTE.slice(0, -2).map(normalizeColor);
    const choices = listSelectableColors(used, null, 12);
    const free = choices.filter(
      (color) => !used.includes(normalizeColor(color)),
    );
    expect(free.length).toBeGreaterThanOrEqual(12);
  });
});
