/**
 * @file expense-categories.ts
 * @description Catégories de dépenses, matching par mots-clés.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recurringGroupKey } from "@/lib/finance/recurring-labels";
import type { Category } from "@/types/database";

/** Termes bancaires génériques qui ne doivent jamais servir de mot-clé. */
const GENERIC_KEYWORD_BLOCKLIST = new Set([
  "PAIEMENT",
  "PAR",
  "PAIEMENT PAR",
  "PAIEMENT PAR CARTE",
  "CARTE",
  "PRELEVEMENT",
  "PRELEV",
  "PRLV",
  "SEPA",
  "VIR",
  "VIREMENT",
  "VIR INST",
  "VIREMENT EMIS",
  "DEBIT",
  "ACHAT",
  "MANDAT",
  "TIP",
  "FACTURE",
  "FACT",
  "COMMISSION",
  "REF",
]);

export function isUsableKeyword(keyword: string): boolean {
  const normalized = keyword.trim().toUpperCase();
  if (normalized.length < 3) {
    return false;
  }
  return !GENERIC_KEYWORD_BLOCKLIST.has(normalized);
}

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

/** Palette curatée de couleurs distinctes proposées dans le sélecteur. */
export const CATEGORY_COLOR_PALETTE = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#CA8A04",
  "#84CC16",
  "#22C55E",
  "#0D9488",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#A855F7",
  "#D946EF",
  "#EC4899",
  "#F43F5E",
  "#64748B",
  "#94A3B8",
  "#78716C",
];

export function normalizeColor(color: string): string {
  return color.trim().toUpperCase();
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/.test(normalizeColor(color));
}

/** Renvoie la première couleur de la palette non utilisée, sinon une couleur de repli. */
export function pickAvailableColor(usedColors: Iterable<string>): string {
  const used = new Set([...usedColors].map((color) => normalizeColor(color)));

  for (const color of CATEGORY_COLOR_PALETTE) {
    if (!used.has(normalizeColor(color))) {
      return color;
    }
  }

  return CATEGORY_COLOR_PALETTE[
    used.size % CATEGORY_COLOR_PALETTE.length
  ];
}

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
    if (normalized && isUsableKeyword(normalized)) {
      merged.set(normalized, keyword.trim());
    }
  }

  return [...merged.values()];
}

function sanitizeKeywordRules(rules: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const keyword of rules) {
    const normalized = normalizeKeyword(keyword);
    if (!normalized || seen.has(normalized) || !isUsableKeyword(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(keyword.trim());
  }

  return result;
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
        isUsableKeyword(normalized) &&
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
  const groupKey = recurringGroupKey(description);
  const words = groupKey
    .split(" ")
    .filter((word) => /[A-Z]/.test(word) && word.length >= 2);

  if (words.length === 0) {
    return null;
  }

  let candidate = words.slice(0, 2).join(" ");
  if (candidate.length < 5 && words.length >= 3) {
    candidate = words.slice(0, 3).join(" ");
  }

  return isUsableKeyword(candidate) ? candidate : null;
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

  // Nettoie les mots-clés génériques pollués (ex. "PAIEMENT PAR") sur toutes les catégories.
  for (const row of existingRows) {
    const currentRules = Array.isArray(row.keyword_rules)
      ? row.keyword_rules.map(String)
      : [];
    const sanitized = sanitizeKeywordRules(currentRules);

    if (keywordRulesSignature(currentRules) !== keywordRulesSignature(sanitized)) {
      const { error: cleanError } = await supabase
        .from("categories")
        .update({ keyword_rules: sanitized })
        .eq("id", row.id);

      if (cleanError) {
        throw cleanError;
      }

      row.keyword_rules = sanitized;
      changed = true;
    }
  }

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
