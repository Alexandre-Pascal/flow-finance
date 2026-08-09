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
  "#F59E0B",
  "#EAB308",
  "#CA8A04",
  "#A3E635",
  "#84CC16",
  "#65A30D",
  "#22C55E",
  "#16A34A",
  "#10B981",
  "#0D9488",
  "#14B8A6",
  "#2DD4BF",
  "#06B6D4",
  "#0891B2",
  "#0EA5E9",
  "#3B82F6",
  "#2563EB",
  "#6366F1",
  "#4F46E5",
  "#8B5CF6",
  "#7C3AED",
  "#A855F7",
  "#C026D3",
  "#D946EF",
  "#E879F9",
  "#EC4899",
  "#DB2777",
  "#F43F5E",
  "#E11D48",
  "#FB7185",
  "#F87171",
  "#FB923C",
  "#FBBF24",
  "#FDE047",
  "#4ADE80",
  "#34D399",
  "#67E8F9",
  "#60A5FA",
  "#818CF8",
  "#C084FC",
  "#F472B6",
  "#64748B",
  "#475569",
  "#94A3B8",
  "#78716C",
  "#A8A29E",
  "#B45309",
  "#9F1239",
];

export function normalizeColor(color: string): string {
  return color.trim().toUpperCase();
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/.test(normalizeColor(color));
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

/** Convertit HSL (h 0–360, s/l 0–100) en hex #RRGGBB. */
export function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = ((h % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (huePrime < 1) {
    r = chroma;
    g = x;
  } else if (huePrime < 2) {
    r = x;
    g = chroma;
  } else if (huePrime < 3) {
    g = chroma;
    b = x;
  } else if (huePrime < 4) {
    g = x;
    b = chroma;
  } else if (huePrime < 5) {
    r = x;
    g = 0;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  const match = lightness - chroma / 2;
  return `#${toHexChannel((r + match) * 255)}${toHexChannel((g + match) * 255)}${toHexChannel((b + match) * 255)}`;
}

/** Génère une couleur distincte hors palette (angle d’or). */
export function generateDistinctColor(index: number): string {
  const hue = (index * 137.508) % 360;
  const lightness = 42 + (index % 5) * 4;
  const saturation = 58 + (index % 3) * 8;
  return hslToHex(hue, saturation, lightness);
}

/**
 * Couleurs affichables dans le sélecteur : palette + teintes libres
 * si presque toutes les couleurs de base sont prises.
 */
export function listSelectableColors(
  usedColors: Iterable<string>,
  selectedColor?: string | null,
  minFree = 12,
): string[] {
  const used = new Set([...usedColors].map((color) => normalizeColor(color)));
  const selected = selectedColor ? normalizeColor(selectedColor) : null;
  const choices: string[] = [...CATEGORY_COLOR_PALETTE];
  const seen = new Set(choices.map((color) => normalizeColor(color)));

  const freeCount = () =>
    choices.filter((color) => {
      const normalized = normalizeColor(color);
      return !used.has(normalized) || normalized === selected;
    }).length;

  let generated = 0;
  while (freeCount() < minFree && generated < 360) {
    const candidate = generateDistinctColor(generated);
    generated += 1;
    const normalized = normalizeColor(candidate);
    if (seen.has(normalized) || used.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    choices.push(candidate);
  }

  if (selected && !seen.has(selected) && isValidHexColor(selected)) {
    choices.push(selected);
  }

  return choices;
}

/** Renvoie une couleur non utilisée (palette puis génération). */
export function pickAvailableColor(usedColors: Iterable<string>): string {
  const used = new Set([...usedColors].map((color) => normalizeColor(color)));

  for (const color of CATEGORY_COLOR_PALETTE) {
    if (!used.has(normalizeColor(color))) {
      return color;
    }
  }

  for (let index = 0; index < 720; index += 1) {
    const color = generateDistinctColor(index);
    if (!used.has(normalizeColor(color))) {
      return color;
    }
  }

  // Dernier recours : variation de luminosité sur teinte fixe.
  for (let lightness = 20; lightness <= 80; lightness += 1) {
    const color = hslToHex(210, 70, lightness);
    if (!used.has(normalizeColor(color))) {
      return color;
    }
  }

  return generateDistinctColor(used.size);
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
      "UBER EATS",
      "DELIVEROO",
    ],
  },
  {
    name: "Essence",
    color: "#F97316",
    keyword_rules: [
      "LECLERC STATIO",
      "INTER STATION",
      "ESSO",
      "SHELL",
      "BP ",
      "CARBURANT",
      "TOTAL ",
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
      "LECLERC",
      "AUCHAN",
      "INTERMARCHE",
      "LIDL",
      "SUPER U",
      "MONOPRIX",
      "FRANPRIX",
      "ALDI",
      "EPICERIE",
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
      "RATP",
      "UBER",
      "BOLT",
      "EASYPARK",
      "HORODATEURS",
    ],
  },
  {
    name: "Loisirs",
    color: "#A855F7",
    keyword_rules: [
      "CINEMA",
      "DECATHLON",
      "INTERSPORT",
      "BOWLING",
      "MUSEE",
      "THEATRE",
    ],
  },
  {
    name: "Hébergement",
    color: "#14B8A6",
    keyword_rules: [
      "BOOKING.COM",
      "AIRBNB",
      "HOTEL ",
      "IBIS",
    ],
  },
  {
    name: "Shopping",
    color: "#F43F5E",
    keyword_rules: [
      "AMAZON",
      "KIABI",
      "ACTION ",
      "BRICOMARCHE",
      "MR BRICOLAGE",
      "VINTED",
      "LEBONCOIN",
    ],
  },
  {
    name: "Santé",
    color: "#06B6D4",
    keyword_rules: ["PHARMACIE", "LABORATOIRE", "MUTUELLE"],
  },
  {
    name: "Administration",
    color: "#64748B",
    keyword_rules: ["URSSAF", "IMPOTS", "TRESOR PUBLIC", "AMENDE"],
  },
  {
    name: "Épargne",
    color: "#0D9488",
    keyword_rules: ["MENS.PEL", "LIVRET"],
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
    keyword_rules: ["APP STORE", "GOOGLE PLAY", "STEAM", "PLAYSTATION"],
  },
  {
    name: "Poste",
    color: "#CA8A04",
    keyword_rules: ["LAPOSTE", "LA POSTE"],
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
  // On ne sème les catégories par défaut que pour un utilisateur sans aucune
  // catégorie. Au-delà, on respecte ses choix (y compris les suppressions).
  const isFreshUser = existingRows.length === 0;
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

    if (!isFreshUser) {
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
