/**
 * @file expense-categories.ts
 * @description Catégories de dépenses, matching par mots-clés.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMerchantKey } from "@/lib/finance/recurring-detection";
import type { Category } from "@/types/database";

// La catégorisation se fait uniquement via le libellé bancaire.

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
    keyword_rules: [
      "RESTAURANT",
      "RESTO",
      "BRASSERIE",
      "MAC DONALD",
      "MCDONALD",
      "BURGER KING",
      "KFC",
      "PRET A MANGER",
      "BOULANGERIE",
      "PANETIERE",
      "FOURNIL",
      "UBER EATS",
      "MUY ET MUCHO",
      "BM RESTAURATION",
      "AU FUT ET A MESU",
      "LA GUINGUETTE",
      "LE CHIQUITO",
      "O DEUX FRERES",
      "PANAME",
      "LA MIE SAVEURS",
      "SUNDAY*",
      "LOFT 89",
      "L ALCHIMISTE",
      "L APARTE",
      "GD CAFE",
      "LSP*LE COMPTOIR",
      "LA STRADA",
      "FEUILLETTE",
      "ORKA",
      "LA CASA DI",
      "LE NEUF",
      "DIVONA PIZZA",
      "STALIREST",
      "AU BRUIT QUI COU",
      "LE SAN VICENS",
      "DISTRI CAFE",
      "TOUAJIN",
      "SELECTA",
      "LOU PASCALOU",
      "LE COMPTOIR",
      "LA MALAVITA",
      "LOU CANTOU",
      "LE GRAND TETRAS",
      "SA UMBRESSO",
      "LA PANETIERE",
    ],
  },
  {
    name: "Essence",
    color: "#F97316",
    keyword_rules: [
      "E.LECLERC STATIO",
      "LECLERC STATIO",
      "INTER STATION",
      "INTER HORACE",
      "GASOPAS",
      "ESSO",
      "SHELL",
      "BP ",
      "CARBURANT",
      "STATIO PRA",
    ],
  },
  {
    name: "Péage",
    color: "#EAB308",
    keyword_rules: [
      "AUTOROUTES DU SUD",
      "SANEF",
      "APRR",
      "ASF-",
      "ASF ",
      "PEAGE",
      "PÉAGE",
      "VINCI",
    ],
  },
  {
    name: "Courses",
    color: "#22C55E",
    keyword_rules: [
      "CARREFOUR",
      "PRADIS LECLERC",
      "CENTRE LECLERC",
      "LECLERC ONET",
      "LECLERC CAPDENAC",
      "LECLERC FOIX",
      "AUCHAN",
      "INTERMARCHE",
      "INTER IROLY",
      "LIDL",
      "SUPER U",
      "UEP*DAC SUPER U",
      "UEP*SUPER U",
      "UEP*DAC",
      "MONOPRIX",
      "FRANPRIX",
      "ALDI",
      "EUROMERCAT",
      "HIPER PAS",
      "CAPEL 4 SAISONS",
      "EPICERIE",
      "SAVILAO",
      "OUTLET DISTRIBUT",
      "CARREFOUR CITY",
      "CARREFOUR CONTACT",
      "CARREFOUR MONTAUBAN",
      "RMS 31 CARREFOUR",
      "MAR & CAS",
      "HIPER PAS",
    ],
  },
  {
    name: "Retrait",
    color: "#3B82F6",
    keyword_rules: [
      "RETRAIT AU DISTRIBUTEUR",
      "RETRAIT DAB",
      "RETRAIT CB",
      "DISTRIBUTEUR",
    ],
  },
  {
    name: "Transport",
    color: "#6366F1",
    keyword_rules: [
      "SNCF",
      "OUIGO",
      "NAVIGO",
      "TISSEO",
      "SERVICE NAVIGO",
      "EASYPARK",
      "HORODATEURS",
      "FREEBIKE",
      "SOCIETE D EXPLOITATI",
      "2THELOO",
    ],
  },
  {
    name: "Loisirs",
    color: "#A855F7",
    keyword_rules: [
      "BOWLING",
      "DECATHLON",
      "INTERSPORT",
      "KING JOUET",
      "QUIZZ ROOM",
      "SPORT TICKETING",
      "DECKDIS",
      "FORF P.STAT",
      "ALTI FONT ROMEU",
      "KEEP COOL",
      "FF ATHLETISME",
      "DOWNTOWN FACTORY",
      "ZEVENT",
      "FORF P.",
    ],
  },
  {
    name: "Hébergement",
    color: "#14B8A6",
    keyword_rules: [
      "BOOKING.COM",
      "HOTEL AT BOOKING",
      "AIRBNB",
      "HOTEL IBIS",
      "HOTEL ",
    ],
  },
  {
    name: "Shopping",
    color: "#F43F5E",
    keyword_rules: [
      "AMAZON PAYMENTS",
      "AMAZON PRIME FR",
      "KIABI",
      "ACTION DECAZEVILLE",
      "ACTION ",
      "BRICOMARCHE",
      "MR BRICOLAGE",
      "VINTED",
      "LEBONCOIN",
      "CORDONNERIE",
      "COMMERCIALISATION PI",
    ],
  },
  {
    name: "Santé",
    color: "#06B6D4",
    keyword_rules: ["PHARMACIE", "OPHT", "ASSOCIATION OPHT"],
  },
  {
    name: "Administration",
    color: "#64748B",
    keyword_rules: ["ED DES AFFAIRES CRIMINEL", "ED AFF CRIM"],
  },
  {
    name: "Épargne",
    color: "#0D9488",
    keyword_rules: ["MENS.PEL"],
  },
  {
    name: "Virements émis",
    color: "#78716C",
    keyword_rules: [
      "VIREMENT EMIS WERO",
      "VIREMENT EMIS WEB",
      "VIREMENT EMIS VIR INST",
    ],
  },
  {
    name: "Jeux & apps",
    color: "#D946EF",
    keyword_rules: ["SUPERCELL", "CURSOR"],
  },
  {
    name: "Poste",
    color: "#CA8A04",
    keyword_rules: ["LAPOSTE"],
  },
  {
    name: "Dons",
    color: "#84CC16",
    keyword_rules: ["HELLO ASSO", "HELLOASSO"],
  },
  {
    name: "Frais bancaires",
    color: "#94A3B8",
    keyword_rules: ["COTISATION CARTE", "FRAIS PRELEVEMENT", "FRAIS Prélèvement"],
  },
];

function mergeKeywordRules(existing: string[], defaults: string[]): string[] {
  const merged = new Map<string, string>();

  for (const keyword of [...existing, ...defaults]) {
    const normalized = normalizeKeyword(keyword);
    if (normalized) {
      merged.set(normalized, keyword.trim());
    }
  }

  return [...merged.values()];
}

function keywordRulesSignature(rules: string[]): string {
  return [...rules].map(normalizeKeyword).sort().join("\0");
}

/** Exclut les dépenses déjà gérées par les abonnements ou hors périmètre. */
export function shouldAutoCategorize(description: string): boolean {
  const normalized = description.toUpperCase();

  if (normalized.includes("PRELEVEMENT") && normalized.includes("PAYPAL")) {
    return false;
  }

  if (normalized.includes("VIREMENT EN VOTRE FAVEUR")) {
    return false;
  }

  return true;
}

export function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    color: String(row.color),
    keyword_rules: Array.isArray(row.keyword_rules)
      ? row.keyword_rules.map(String)
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

  return null;
}

export function buildLearnedKeyword(description: string): string | null {
  const merchantKey = extractMerchantKey(description);
  return merchantKey.length >= 3 ? merchantKey : null;
}

export function mergeCategoryLearning(
  category: Category,
  description: string,
): Pick<Category, "keyword_rules"> {
  const keywordRules = [...category.keyword_rules];
  const learnedKeyword = buildLearnedKeyword(description);

  if (
    learnedKeyword &&
    !keywordRules.some(
      (keyword) => normalizeKeyword(keyword) === normalizeKeyword(learnedKeyword),
    )
  ) {
    keywordRules.push(learnedKeyword);
  }

  return {
    keyword_rules: keywordRules,
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

export async function syncDefaultCategories(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ categories: Category[]; changed: boolean }> {
  const { data: existing, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const existingRows = existing ?? [];
  const byName = new Map(
    existingRows.map((row) => [String(row.name).trim().toLowerCase(), row]),
  );
  let changed = false;

  for (const definition of DEFAULT_EXPENSE_CATEGORIES) {
    const key = definition.name.trim().toLowerCase();
    const row = byName.get(key);

    if (row) {
      const currentRules = Array.isArray(row.keyword_rules)
        ? row.keyword_rules.map(String)
        : [];
      const mergedRules = mergeKeywordRules(currentRules, definition.keyword_rules);

      if (keywordRulesSignature(currentRules) !== keywordRulesSignature(mergedRules)) {
        const { error: updateError } = await supabase
          .from("categories")
          .update({ keyword_rules: mergedRules })
          .eq("id", row.id);

        if (updateError) {
          throw updateError;
        }

        changed = true;
      }

      continue;
    }

    const { error: insertError } = await supabase.from("categories").insert({
      user_id: userId,
      name: definition.name,
      color: definition.color,
      keyword_rules: definition.keyword_rules,
    });

    if (insertError) {
      throw insertError;
    }

    changed = true;
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);

  if (refreshError) {
    throw refreshError;
  }

  return {
    categories: dedupeCategories(
      (refreshed ?? []).map((row) => mapCategory(row as Record<string, unknown>)),
    ),
    changed,
  };
}

/** @deprecated Alias conservé pour les imports existants. */
export async function ensureDefaultCategories(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ categories: Category[]; seeded: boolean }> {
  const { categories, changed } = await syncDefaultCategories(supabase, userId);
  return { categories, seeded: changed };
}
