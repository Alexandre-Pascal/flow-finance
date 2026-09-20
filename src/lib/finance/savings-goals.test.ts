import { describe, expect, it } from "vitest";
import {
  buildSavingsGoalsOverview,
  mapSavingsGoalAllocation,
  monthsUntil,
  peaFundingSource,
  PEA_SOURCE_ID,
  savingsFundingSource,
} from "./savings-goals";
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
    source_kind: "savings",
    savings_account_id: accountId,
    amount,
    allocation_mode: mode,
    created_at: "",
    updated_at: "",
  };
}

/** Affectation visant le PEA : pas d'id de livret. */
function peaAllocation(
  goalId: string,
  amount: number,
  mode: SavingsGoalAllocationMode = "fixed",
): SavingsGoalAllocation {
  return {
    ...allocation(goalId, PEA_SOURCE_ID, amount, mode),
    source_kind: "pea",
    savings_account_id: null,
  };
}

/** Livret réservé en entier : le montant stocké n'est pas lu. */
function fullAllocation(goalId: string, accountId: string) {
  return allocation(goalId, accountId, 0, "full");
}

/** Livret pris pour ce qui reste après les autres objectifs. */
function remainderAllocation(goalId: string, accountId: string) {
  return allocation(goalId, accountId, 0, "remainder");
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
        savingsFundingSource(livretA, 8200),
        savingsFundingSource(lep, 1500),
      ],
    );

    const [matelas, voyage] = overview.goals;
    expect(matelas.allocated).toBe(5000);
    expect(matelas.remaining).toBe(1000);
    expect(matelas.isReached).toBe(false);
    // Le voyage est financé sur deux livrets.
    expect(voyage.allocated).toBe(2500);
    expect(voyage.allocations.map((row) => row.sourceName)).toEqual([
      "Livret A",
      "LEP",
    ]);

    const [viewA, viewLep] = overview.sources;
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
      [savingsFundingSource(livretA, 8200)],
    );

    expect(overview.sources[0].unallocated).toBe(-800);
    expect(overview.sources[0].isOverAllocated).toBe(true);
    expect(overview.hasOverAllocation).toBe(true);
  });

  it("ignores allocations pointing at an account that no longer exists", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 6000)],
      [allocation("g1", livretA.id, 5000), allocation("g1", "deleted", 1000)],
      [savingsFundingSource(livretA, 8200)],
    );

    expect(overview.goals[0].allocated).toBe(5000);
    expect(overview.totalAllocated).toBe(5000);
  });

  it("caps progress at 100% once the target is reached", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 5000)],
      [allocation("g1", livretA.id, 6000)],
      [savingsFundingSource(livretA, 8200)],
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
      [savingsFundingSource(livretA, 8200)],
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
        savingsFundingSource(livretA, 8200),
        savingsFundingSource(lep, 1500),
      ],
    );

    // Rien n'est saisi : l'objectif vaut la somme des soldes du moment.
    expect(overview.goals[0].allocated).toBe(9700);
    expect(overview.goals[0].remaining).toBe(10300);
    expect(overview.goals[0].allocations[0].mode).toBe("full");
    expect(overview.sources[0].isReserved).toBe(true);
    expect(overview.sources[0].unallocated).toBe(0);
    expect(overview.totalUnallocated).toBe(0);
    expect(overview.hasOverAllocation).toBe(false);
  });

  it("follows the balance upwards without touching the allocation", () => {
    const allocations = [fullAllocation("g1", livretA.id)];
    const goals = [goal("g1", "Apport", 20000)];

    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        savingsFundingSource(livretA, 8200),
      ]).goals[0].allocated,
    ).toBe(8200);
    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        savingsFundingSource(livretA, 9000),
      ]).goals[0].allocated,
    ).toBe(9000);
  });

  it("flags a reserved account that another goal also draws on", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Apport", 20000), goal("g2", "Voyage", 3000, null, 1)],
      [fullAllocation("g1", livretA.id), allocation("g2", livretA.id, 2000)],
      [savingsFundingSource(livretA, 8200)],
    );

    expect(overview.sources[0].allocated).toBe(10200);
    expect(overview.sources[0].isOverAllocated).toBe(true);
    expect(overview.hasOverAllocation).toBe(true);
  });

  it("gives the rest of an account to a goal, next to a fixed share", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 10000), goal("g2", "Apport", 40000, null, 1)],
      [allocation("g1", livretA.id, 10000), remainderAllocation("g2", livretA.id)],
      [savingsFundingSource(livretA, 19000)],
    );

    const [matelas, apport] = overview.goals;
    expect(matelas.allocated).toBe(10000);
    expect(apport.allocated).toBe(9000);
    expect(apport.allocations[0].mode).toBe("remainder");

    const [view] = overview.sources;
    expect(view.allocated).toBe(19000);
    expect(view.unallocated).toBe(0);
    expect(view.hasRemainderClaim).toBe(true);
    expect(view.isOverAllocated).toBe(false);
    expect(overview.hasOverAllocation).toBe(false);
  });

  it("lets the rest grow with the balance", () => {
    const goals = [
      goal("g1", "Matelas de sécu", 10000),
      goal("g2", "Apport", 40000, null, 1),
    ];
    const allocations = [
      allocation("g1", livretA.id, 10000),
      remainderAllocation("g2", livretA.id),
    ];

    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        savingsFundingSource(livretA, 20000),
      ]).goals[1].allocated,
    ).toBe(10000);
  });

  it("splits the rest between goals that both claim it", () => {
    const overview = buildSavingsGoalsOverview(
      [
        goal("g1", "Matelas de sécu", 10000),
        goal("g2", "Apport", 40000, null, 1),
        goal("g3", "Voyage", 5000, null, 2),
      ],
      [
        allocation("g1", livretA.id, 10000),
        remainderAllocation("g2", livretA.id),
        remainderAllocation("g3", livretA.id),
      ],
      [savingsFundingSource(livretA, 19000)],
    );

    const [, apport, voyage] = overview.goals;
    expect(apport.allocated + voyage.allocated).toBe(9000);
    expect(apport.allocated).toBe(4500);
    expect(overview.sources[0].unallocated).toBe(0);
    expect(overview.hasOverAllocation).toBe(false);
  });

  it("leaves nothing to the rest when fixed shares already exceed the balance", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Matelas de sécu", 20000), goal("g2", "Apport", 40000, null, 1)],
      [allocation("g1", livretA.id, 20000), remainderAllocation("g2", livretA.id)],
      [savingsFundingSource(livretA, 19000)],
    );

    expect(overview.goals[1].allocated).toBe(0);
    expect(overview.sources[0].isOverAllocated).toBe(true);
  });

  it("funds a goal with a share of the PEA, next to a savings account", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Apport", 40000)],
      [allocation("g1", livretA.id, 8000), peaAllocation("g1", 5000)],
      [savingsFundingSource(livretA, 8200), peaFundingSource("PEA", 12000)],
    );

    expect(overview.goals[0].allocated).toBe(13000);
    expect(overview.goals[0].allocations.map((row) => row.sourceKind)).toEqual([
      "savings",
      "pea",
    ]);

    const pea = overview.sources[1];
    expect(pea.source.kind).toBe("pea");
    expect(pea.allocated).toBe(5000);
    expect(pea.unallocated).toBe(7000);
    expect(overview.totalBalance).toBe(20200);
  });

  it("lets the PEA be taken whole and follow its valuation", () => {
    const goals = [goal("g1", "Apport", 40000)];
    const allocations = [peaAllocation("g1", 0, "full")];

    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        peaFundingSource("PEA", 12000),
      ]).goals[0].allocated,
    ).toBe(12000);
    // Les cours montent : l'objectif suit, sans ressaisie.
    expect(
      buildSavingsGoalsOverview(goals, allocations, [
        peaFundingSource("PEA", 12800),
      ]).goals[0].allocated,
    ).toBe(12800);
  });

  it("keeps a savings share and a PEA share apart on the same goal", () => {
    const overview = buildSavingsGoalsOverview(
      [goal("g1", "Apport", 40000)],
      [
        allocation("g1", livretA.id, 10000, "remainder"),
        peaAllocation("g1", 0, "remainder"),
      ],
      [savingsFundingSource(livretA, 19000), peaFundingSource("PEA", 12000)],
    );

    // Chaque support a son propre « reste » : 19 000 et 12 000.
    expect(overview.goals[0].allocated).toBe(31000);
    expect(overview.sources.every((view) => view.unallocated === 0)).toBe(true);
  });

  it("keeps the allocation mode as stored, so a saved share is not dropped", () => {
    const row = {
      id: "a1",
      user_id: "user-1",
      goal_id: "g1",
      savings_account_id: livretA.id,
      amount: 0,
    };

    expect(
      mapSavingsGoalAllocation({ ...row, allocation_mode: "remainder" })
        .allocation_mode,
    ).toBe("remainder");
    expect(
      mapSavingsGoalAllocation({ ...row, allocation_mode: "full" })
        .allocation_mode,
    ).toBe("full");
    // Mode inconnu (base pas à jour) : on retombe sur le montant fixe.
    expect(
      mapSavingsGoalAllocation({ ...row, allocation_mode: "wat" })
        .allocation_mode,
    ).toBe("fixed");

    const pea = mapSavingsGoalAllocation({
      ...row,
      savings_account_id: null,
      source_kind: "pea",
      allocation_mode: "full",
    });
    expect(pea.source_kind).toBe("pea");
    expect(pea.savings_account_id).toBeNull();
  });

  it("counts no month left once the deadline has passed", () => {
    const now = new Date(2026, 8, 19);

    expect(monthsUntil("2026-12-20", now)).toBe(3);
    expect(monthsUntil("2026-09-30", now)).toBe(0);
    expect(monthsUntil("2026-06-01", now)).toBe(0);
  });
});
