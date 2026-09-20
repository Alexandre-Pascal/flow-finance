/**
 * @file savings-goals.ts
 * @description Objectifs d'épargne financés par des parts de livrets. Une
 * affectation vaut un montant fixe, le reste du livret, ou sa totalité — les
 * deux derniers suivent le solde réel et se complètent tout seuls. Un livret
 * peut porter plusieurs objectifs et le solde non affecté reste visible ; les
 * montants fixes ne sont jamais rognés, on signale les livrets sur-affectés.
 */

import type {
  SavingsAccount,
  SavingsGoal,
  SavingsGoalAllocation,
  SavingsGoalAllocationMode,
} from "@/types/database";

/** Solde connu d'un livret, tel que reconstruit par `buildSavingsOverview`. */
export interface GoalFundingAccount {
  account: SavingsAccount;
  balance: number;
}

export interface GoalAllocationView {
  accountId: string;
  accountName: string;
  color: string;
  /** Montant réellement compté : le solde du livret en mode « tout le livret ». */
  amount: number;
  mode: SavingsGoalAllocationMode;
}

export interface SavingsGoalView {
  goal: SavingsGoal;
  /** Somme affectée à l'objectif, tous livrets confondus. */
  allocated: number;
  /** Reste à financer (0 si la cible est atteinte). */
  remaining: number;
  /** Avancement borné à 1, pour la barre de progression. */
  progress: number;
  isReached: boolean;
  allocations: GoalAllocationView[];
  /** Mois restants avant l'échéance, `null` sans échéance. */
  monthsLeft: number | null;
  /** Effort mensuel pour tenir l'échéance, `null` sans échéance ou si atteint. */
  monthlyEffort: number | null;
}

export interface GoalAccountView {
  account: SavingsAccount;
  balance: number;
  allocated: number;
  /** Solde non affecté : négatif si les objectifs dépassent le solde. */
  unallocated: number;
  isOverAllocated: boolean;
  /** Un objectif réserve la totalité du livret. */
  isReserved: boolean;
  /** Un objectif récupère ce qui reste du livret. */
  hasRemainderClaim: boolean;
  goals: Array<{
    goalId: string;
    goalName: string;
    color: string;
    amount: number;
    mode: SavingsGoalAllocationMode;
  }>;
}

export interface SavingsGoalsOverview {
  goals: SavingsGoalView[];
  accounts: GoalAccountView[];
  totalTarget: number;
  totalAllocated: number;
  totalBalance: number;
  /** Épargne disponible, hors objectifs. */
  totalUnallocated: number;
  hasOverAllocation: boolean;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function mapSavingsGoal(row: Record<string, unknown>): SavingsGoal {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    target_amount: Number(row.target_amount ?? 0),
    target_date: row.target_date ? String(row.target_date) : null,
    color: String(row.color ?? "#CA8A04"),
    note: row.note ? String(row.note) : null,
    position: Number(row.position ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Tout mode inconnu retombe sur « montant fixe », le seul qui lit `amount`. */
function parseAllocationMode(raw: unknown): SavingsGoalAllocationMode {
  return raw === "full" || raw === "remainder" ? raw : "fixed";
}

export function mapSavingsGoalAllocation(
  row: Record<string, unknown>,
): SavingsGoalAllocation {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    goal_id: String(row.goal_id),
    savings_account_id: String(row.savings_account_id),
    amount: Number(row.amount ?? 0),
    allocation_mode: parseAllocationMode(row.allocation_mode),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Mois pleins restants avant l'échéance (0 si elle est passée ou imminente). */
export function monthsUntil(targetDate: string, now: Date): number {
  const [year, month, day] = targetDate.split("-").map(Number);
  if (!year || !month || !day) {
    return 0;
  }

  const months = (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
  return Math.max(0, day >= now.getDate() ? months : months - 1);
}

/**
 * Croise objectifs, affectations et soldes réels des livrets.
 * Les affectations orphelines (livret supprimé) sont ignorées.
 */
export function buildSavingsGoalsOverview(
  goals: SavingsGoal[],
  allocations: SavingsGoalAllocation[],
  fundingAccounts: GoalFundingAccount[],
  now: Date = new Date(),
): SavingsGoalsOverview {
  const accountById = new Map(
    fundingAccounts.map((funding) => [funding.account.id, funding]),
  );
  const known = allocations.filter(
    (allocation) =>
      accountById.has(allocation.savings_account_id) &&
      (allocation.allocation_mode !== "fixed" || allocation.amount > 0),
  );

  const sortedGoals = [...goals].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
  const goalById = new Map(sortedGoals.map((goal) => [goal.id, goal]));
  const goalRank = new Map(sortedGoals.map((goal, index) => [goal.id, index]));

  const byGoal = new Map<string, SavingsGoalAllocation[]>();
  const byAccount = new Map<string, SavingsGoalAllocation[]>();
  for (const allocation of known) {
    const goalRows = byGoal.get(allocation.goal_id) ?? [];
    goalRows.push(allocation);
    byGoal.set(allocation.goal_id, goalRows);

    const accountRows = byAccount.get(allocation.savings_account_id) ?? [];
    accountRows.push(allocation);
    byAccount.set(allocation.savings_account_id, accountRows);
  }

  // Le montant compté dépend du livret entier : « tout » prend le solde, « le
  // reste » prend ce que les autres objectifs n'ont pas pris. On résout donc
  // livret par livret avant de parcourir les objectifs.
  const countedById = new Map<string, number>();
  for (const [accountId, rows] of byAccount) {
    const balance = Math.max(0, accountById.get(accountId)?.balance ?? 0);
    const remainderRows: SavingsGoalAllocation[] = [];
    let claimed = 0;

    for (const allocation of rows) {
      if (allocation.allocation_mode === "remainder") {
        remainderRows.push(allocation);
        continue;
      }
      const counted =
        allocation.allocation_mode === "full" ? balance : allocation.amount;
      countedById.set(allocation.id, counted);
      claimed += counted;
    }

    const left = Math.max(0, round(balance - claimed));
    // Plusieurs objectifs sur « le reste » du même livret : ils le partagent à
    // parts égales, les centimes restants allant au premier de la liste.
    const share = remainderRows.length > 0 ? Math.floor((left * 100) / remainderRows.length) / 100 : 0;
    const ordered = [...remainderRows].sort(
      (a, b) =>
        (goalRank.get(a.goal_id) ?? 0) - (goalRank.get(b.goal_id) ?? 0),
    );
    ordered.forEach((allocation, index) => {
      countedById.set(
        allocation.id,
        index === 0 ? round(left - share * (ordered.length - 1)) : share,
      );
    });
  }

  const effectiveAmount = (allocation: SavingsGoalAllocation): number =>
    countedById.get(allocation.id) ?? 0;

  const goalViews: SavingsGoalView[] = sortedGoals.map((goal) => {
    const rows = byGoal.get(goal.id) ?? [];
    const allocated = round(
      rows.reduce((sum, allocation) => sum + effectiveAmount(allocation), 0),
    );
    const remaining = round(Math.max(0, goal.target_amount - allocated));
    const monthsLeft = goal.target_date
      ? monthsUntil(goal.target_date, now)
      : null;

    return {
      goal,
      allocated,
      remaining,
      progress:
        goal.target_amount > 0
          ? Math.min(1, allocated / goal.target_amount)
          : 0,
      isReached: allocated >= goal.target_amount,
      allocations: rows
        .map((allocation) => {
          const funding = accountById.get(allocation.savings_account_id);
          return {
            accountId: allocation.savings_account_id,
            accountName: funding?.account.name ?? "",
            color: funding?.account.color ?? "#475569",
            amount: effectiveAmount(allocation),
            mode: allocation.allocation_mode,
          };
        })
        .sort((a, b) => b.amount - a.amount),
      monthsLeft,
      monthlyEffort:
        monthsLeft === null || remaining === 0
          ? null
          : round(remaining / Math.max(1, monthsLeft)),
    };
  });

  const accountViews: GoalAccountView[] = fundingAccounts.map((funding) => {
    const rows = byAccount.get(funding.account.id) ?? [];
    const allocated = round(
      rows.reduce((sum, allocation) => sum + effectiveAmount(allocation), 0),
    );

    return {
      account: funding.account,
      balance: funding.balance,
      allocated,
      unallocated: round(funding.balance - allocated),
      isOverAllocated: round(allocated) > round(funding.balance),
      isReserved: rows.some(
        (allocation) => allocation.allocation_mode === "full",
      ),
      hasRemainderClaim: rows.some(
        (allocation) => allocation.allocation_mode === "remainder",
      ),
      goals: rows
        .map((allocation) => {
          const goal = goalById.get(allocation.goal_id);
          return {
            goalId: allocation.goal_id,
            goalName: goal?.name ?? "",
            color: goal?.color ?? "#CA8A04",
            amount: effectiveAmount(allocation),
            mode: allocation.allocation_mode,
          };
        })
        .sort((a, b) => b.amount - a.amount),
    };
  });

  const totalBalance = round(
    fundingAccounts.reduce((sum, funding) => sum + funding.balance, 0),
  );
  const totalAllocated = round(
    known.reduce((sum, allocation) => sum + effectiveAmount(allocation), 0),
  );

  return {
    goals: goalViews,
    accounts: accountViews,
    totalTarget: round(
      sortedGoals.reduce((sum, goal) => sum + goal.target_amount, 0),
    ),
    totalAllocated,
    totalBalance,
    totalUnallocated: round(totalBalance - totalAllocated),
    hasOverAllocation: accountViews.some((view) => view.isOverAllocated),
  };
}
