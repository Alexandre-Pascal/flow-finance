/**
 * @file expense-categories.ts
 * @description Catégories de dépenses, matching par mots-clés et montants appris.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMerchantKey } from "@/lib/finance/recurring-detection";
import type { Category } from "@/types/database";

export const CATEGORY_AMOUNT_TOLERANCE = 0.5;

export const DEFAULT_CATEGORY_COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
];

export const DEFAULT_EXPENSE_CATEGORIES: Array<{
  name: string;
  color: string;
  keyword_rules: string[];
}> = [
  {
    name: "Restaurants",
    color: "#EF4444",
    keyword_rules: ["RESTAURANT", "RESTO", "BRASSERIE", "MAC DO", "MCDONALD", "BURGER"],
  },
  {
    name: "Essence",
    color: "#F97316",
    keyword_rules: ["TOTAL", "ESSO", "SHELL", "BP ", "STATION", "CARBURANT"],
  },
  {
    name: "Péage",
    color: "#EAB308",
    keyword_rules: ["SANEF", "APRR", "ASF", "PEAGE", "PÉAGE", "AUTOROUTE", "VINCI"],
  },
  {
    name: "Courses",
    color: "#22C55E",
    keyword_rules: [
      "CARREFOUR",
      "LECLERC",
      "AUCHAN",
      "INTERMARCHE",
      "LIDL",
      "SUPER U",
      "MONOPRIX",
      "FRANPRIX",
    ],
  },
  {
    name: "Retrait",
    color: "#3B82F6",
    keyword_rules: ["RETRAIT DAB", "RETRAIT CB", "DAB ", "DISTRIBUTEUR"],
  },
];

export function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    color: String(row.color),
    keyword_rules: Array.isArray(row.keyword_rules)
      ? row.keyword_rules.map(String)
      : [],
    amount_hints: Array.isArray(row.amount_hints)
      ? row.amount_hints.map((value) => Number(value))
      : [],
    created_at: String(row.created_at),
  };
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toUpperCase();
}

function descriptionMatchesKeyword(description: string, keyword: string): boolean {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) {
    return false;
  }

  return description.toUpperCase().includes(normalized);
}

export function matchesCategoryByKeywords(
  description: string,
  category: Category,
): boolean {
  return category.keyword_rules.some((keyword) =>
    descriptionMatchesKeyword(description, keyword),
  );
}

export function matchesCategoryByAmount(
  amount: number,
  category: Category,
  description: string,
): boolean {
  if (category.amount_hints.length === 0) {
    return false;
  }

  const debitAmount = Math.round(Math.abs(amount) * 100) / 100;

  return category.amount_hints.some((hint) => {
    if (Math.abs(debitAmount - hint) > CATEGORY_AMOUNT_TOLERANCE) {
      return false;
    }

    return matchesCategoryByKeywords(description, category);
  });
}

export function findMatchingCategory(
  tx: { amount: number; description: string },
  categories: Category[],
): Category | null {
  if (tx.amount >= 0 || categories.length === 0) {
    return null;
  }

  let bestKeywordMatch: Category | null = null;
  let bestKeywordLength = 0;

  for (const category of categories) {
    for (const keyword of category.keyword_rules) {
      const normalized = normalizeKeyword(keyword);
      if (
        normalized.length > bestKeywordLength &&
        descriptionMatchesKeyword(tx.description, normalized)
      ) {
        bestKeywordMatch = category;
        bestKeywordLength = normalized.length;
      }
    }
  }

  if (bestKeywordMatch) {
    return bestKeywordMatch;
  }

  for (const category of categories) {
    if (matchesCategoryByAmount(tx.amount, category, tx.description)) {
      return category;
    }
  }

  return null;
}

export function buildLearnedKeyword(description: string): string | null {
  const merchantKey = extractMerchantKey(description);
  return merchantKey.length >= 3 ? merchantKey : null;
}

export function mergeCategoryLearning(
  category: Category,
  description: string,
  amount: number,
): Pick<Category, "keyword_rules" | "amount_hints"> {
  const keywordRules = [...category.keyword_rules];
  const amountHints = [...category.amount_hints];
  const learnedKeyword = buildLearnedKeyword(description);

  if (
    learnedKeyword &&
    !keywordRules.some(
      (keyword) => normalizeKeyword(keyword) === normalizeKeyword(learnedKeyword),
    )
  ) {
    keywordRules.push(learnedKeyword);
  }

  const debitAmount = Math.round(Math.abs(amount) * 100) / 100;
  const hasCloseHint = amountHints.some(
    (hint) => Math.abs(hint - debitAmount) <= CATEGORY_AMOUNT_TOLERANCE,
  );

  if (!hasCloseHint) {
    amountHints.push(debitAmount);
  }

  return {
    keyword_rules: keywordRules,
    amount_hints: amountHints,
  };
}

export function dedupeCategories(categories: Category[]): Category[] {
  const byId = new Map<string, Category>();

  for (const category of categories) {
    if (!byId.has(category.id)) {
      byId.set(category.id, category);
    }
  }

  const byName = new Map<string, Category>();

  for (const category of byId.values()) {
    const key = category.name.trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, category);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function ensureDefaultCategories(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ categories: Category[]; seeded: boolean }> {
  const { data: existing, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const existingRows = existing ?? [];
  const existingNames = new Set(
    existingRows.map((row) => String(row.name).trim().toLowerCase()),
  );

  const missingDefaults = DEFAULT_EXPENSE_CATEGORIES.filter(
    (category) => !existingNames.has(category.name.trim().toLowerCase()),
  );

  if (missingDefaults.length === 0) {
    return {
      categories: dedupeCategories(
        existingRows.map((row) => mapCategory(row as Record<string, unknown>)),
      ),
      seeded: false,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("categories")
    .insert(
      missingDefaults.map((category) => ({
        user_id: userId,
        name: category.name,
        color: category.color,
        keyword_rules: category.keyword_rules,
      })),
    )
    .select("*");

  if (insertError) {
    throw insertError;
  }

  const merged = [
    ...existingRows.map((row) => mapCategory(row as Record<string, unknown>)),
    ...(inserted ?? []).map((row) => mapCategory(row as Record<string, unknown>)),
  ];

  return {
    categories: dedupeCategories(merged),
    seeded: true,
  };
}
