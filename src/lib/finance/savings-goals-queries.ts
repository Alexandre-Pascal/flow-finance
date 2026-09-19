/**
 * @file savings-goals-queries.ts
 * @description Chargement des objectifs d'épargne et de leurs affectations.
 */

import { getAppUser } from "@/lib/auth";
import {
  mapSavingsGoal,
  mapSavingsGoalAllocation,
} from "@/lib/finance/savings-goals";
import { createClient } from "@/lib/supabase/server";
import type { SavingsGoal, SavingsGoalAllocation } from "@/types/database";

export interface SavingsGoalsData {
  goals: SavingsGoal[];
  allocations: SavingsGoalAllocation[];
  /** `false` tant que la migration `savings_goals` n'est pas appliquée. */
  schemaReady: boolean;
  isDemo: boolean;
}

function emptyData(isDemo: boolean, schemaReady = false): SavingsGoalsData {
  return { goals: [], allocations: [], schemaReady, isDemo };
}

export async function getSavingsGoalsData(): Promise<SavingsGoalsData> {
  const user = await getAppUser();

  if (!user || user.isDemo) {
    return emptyData(true);
  }

  const supabase = await createClient();
  if (!supabase) {
    return emptyData(false);
  }

  const [
    { data: goalRows, error: goalsError },
    { data: allocationRows, error: allocationsError },
  ] = await Promise.all([
    supabase
      .from("savings_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("savings_goal_allocations")
      .select("*")
      .eq("user_id", user.id),
  ]);

  if (goalsError || allocationsError) {
    console.error(
      "[getSavingsGoalsData] load failed:",
      goalsError ?? allocationsError,
    );
    return emptyData(false);
  }

  return {
    goals: (goalRows ?? []).map((row) => mapSavingsGoal(row)),
    allocations: (allocationRows ?? []).map((row) =>
      mapSavingsGoalAllocation(row),
    ),
    schemaReady: true,
    isDemo: false,
  };
}
