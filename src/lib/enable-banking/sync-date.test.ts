import { describe, expect, it } from "vitest";
import { computeTransactionDateFrom } from "./sync-date";

describe("computeTransactionDateFrom", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");

  it("returns undefined for longest strategy", () => {
    expect(
      computeTransactionDateFrom("2026-07-01T00:00:00.000Z", "longest", now),
    ).toBeUndefined();
  });

  it("returns undefined when no previous sync", () => {
    expect(computeTransactionDateFrom(null, "default", now)).toBeUndefined();
    expect(computeTransactionDateFrom(undefined, "default", now)).toBeUndefined();
  });

  it("subtracts 3 days overlap from last sync", () => {
    expect(
      computeTransactionDateFrom("2026-07-01T00:00:00.000Z", "default", now),
    ).toBe("2026-06-28");
  });

  it("caps at today when overlap is in the future", () => {
    expect(
      computeTransactionDateFrom("2026-07-10T00:00:00.000Z", "default", now),
    ).toBe("2026-07-03");
  });
});
