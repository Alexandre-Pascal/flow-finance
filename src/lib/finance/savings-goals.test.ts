import { describe, expect, it } from "vitest";
import { buildSavingsGoalsOverview, monthsUntil } from "./savings-goals";
import type {
  SavingsAccount,
  SavingsGoal,
  SavingsGoalAllocation,
  SavingsGoalAllocationMode,
} from "@/types/database";

function account(id: string, name: string): SavingsAccount {
  return {
    id,
    user_id: "user-1",
    name,
    kind: "livret_a",
    color: "#CA8A04",
    base_balance: 0,
    base_date: "2026-01-01",
    interest_rate: null,
    ceiling: null,
    opening_date: null,
    deposit_keywords: [],
    withdrawal_keywords: [],
    created_at: "",
    updated_at: "",
  };
}

function goal(
  id: string,
  name: string,
  targetAmount: number,
  targetDate: string | null = null,
  position = 0,
): SavingsGoal {
  return {
    id,
    user_id: "user-1",
    name,
    target_amount: targetAmount,
    target_date: targetDate,
    color: "#CA8A04",
    note: null,
    position,
    created_at: "",
    updated_at: "",
  };
}

function allocation(
  goalId: string,
  accountId: string,
  amount: number,
  mode: SavingsGoalAllocationMode = "fixed",
): SavingsGoalAllocation {
  return {
    id: `${goalId}-${accountId}`,
    user_id: "user-1",
    goal_id: goalId,
    savings_account_id: accountId,
    amount,
    allocation_mode: mode,
    created_at: "",
    updated_at: "",
  };
}

/** Livret réservé en entier : le montant stocké n'est pas lu. */
function fullAllocation(goalId: string, accountId: string) {
  return allocation(goalId, accountId, 0, "full");
}

const livretA = account("sav-1", "Livret A");
const lep = account("sav-2", "LEP");

describe("savings goals overview", () => {
  it("splits one savings account between goals and keeps the rest unallocated", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 6000), goal("g2", "Voyage", 3000, null, 1)],
      [
        allocation("g1", livretA.id, 5000),
        allocation("g2", livretA.id, 2000),
        allocation("g2", lep.id, 500),
      ],
      [
        { account: livretA, balance: 8200 },
        { account: lep, balance: 1500 },
      ],
    );

    const [matelas, voyage] = overview.goals;
    expect(matelas.allocated).toBe(5000);
    expect(matelas.remaining).toBe(1000);
    expect(matelas.isReached).toBe(false);
    // Le voyage est financé sur deux livrets.
    expect(voyage.allocated).toBe(2500);
    expect(voyage.allocations.map((row) => row.accountName)).toEqual([
      "Livret A",
      "LEP",
    ]);

    const [viewA, viewLep] = overview.accounts;
    expect(viewA.allocated).toBe(7000);
    expect(viewA.unallocated).toBe(1200);
    expect(viewLep.unallocated).toBe(1000);

    expect(overview.totalAllocated).toBe(7500);
    expect(overview.totalUnallocated).toBe(2200);
    expect(overview.hasOverAllocation).toBe(false);
  });

  it("flags an account whose goals exceed its balance", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 9000)],
      [allocation("g1", livretA.id, 9000)],
      [{ account: livretA, balance: 8200 }],
    );

    expect(overview.accounts[0].unallocated).toBe(-800);
    expect(overview.accounts[0].isOverAllocated).toBe(true);
    expect(overview.hasOverAllocation).toBe(true);
  });

  it("ignores allocations pointing at an account that no longer exists", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 6000)],
      [allocation("g1", livretA.id, 5000), allocation("g1", "deleted", 1000)],
      [{ account: livretA, balance: 8200 }],
    );

    expect(overview.goals[0].allocated).toBe(5000);
    expect(overview.totalAllocated).toBe(5000);
  });

  it("caps progress at 100% once the target is reached", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 5000)],
      [allocation("g1", livretA.id, 6000)],
      [{ account: livretA, balance: 8200 }],
    );

    expect(overview.goals[0].progress).toBe(1);
    expect(overview.goals[0].remaining).toBe(0);
    expect(overview.goals[0].isReached).toBe(true);
    expect(overview.goals[0].monthlyEffort).toBeNull();
  });

  it("spreads what is left over the months before the deadline", () => {
    const now = new Date(2026, 8, 19); // 19 septembre 2026
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Voyage", 3000, "2026-12-20")],
      [allocation("g1", livretA.id, 600)],
      [{ account: livretA, balance: 8200 }],
      now,
    );

    expect(overview.goals[0].monthsLeft).toBe(3);
    expect(overview.goals[0].monthlyEffort).toBe(800);
  });

  it("lets a whole account fund a goal and follow its balance", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Apport", 20000)],
      [fullAllocation("g1", livretA.id), fullAllocation("g1", lep.id)],
      [
        { account: livretA, balance: 8200 },
        { account: lep, balance: 1500 },
      ],
    );

    // Rien n'est saisi : l'objectif vaut la somme des soldes du moment.
    expect(overview.goals[0].allocated).toBe(9700);
    expect(overview.goals[0].remaining).toBe(10300);
    expect(overview.goals[0].allocations[0].mode).toBe("full");
    expect(overview.accounts[0].isReserved).toBe(true);
    expect(overview.accounts[0].unallocated).toBe(0);
    expect(overview.totalUnallocated).toBe(0);
    expect(overview.hasOverAllocation).toBe(false);
  });

  it("follows the balance upwards without touching the allocation", () => {
    const allocations = [fullAllocation("g1", livretA.id)];
    const goals = [goal("g1", "Apport", 20000)];

    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        { account: livretA, balance: 8200 },
      ]).goals[0].allocated,
    ).toBe(8200);
    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        { account: livretA, balance: 9000 },
      ]).goals[0].allocated,
    ).toBe(9000);
  });

  it("flags a reserved account that another goal also draws on", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Apport", 20000), goal("g2", "Voyage", 3000, null, 1)],
      [fullAllocation("g1", livretA.id), allocation("g2", livretA.id, 2000)],
      [{ account: livretA, balance: 8200 }],
    );

    expect(overview.accounts[0].allocated).toBe(10200);
    expect(overview.accounts[0].isOverAllocated).toBe(true);
    expect(overview.hasOverAllocation).toBe(true);
  });

  it("counts no month left once the deadline has passed", () => {
    const now = new Date(2026, 8, 19);

    expect(monthsUntil("2026-12-20", now)).toBe(3);
    expect(monthsUntil("2026-09-30", now)).toBe(0);
    expect(monthsUntil("2026-06-01", now)).toBe(0);
  });
});
