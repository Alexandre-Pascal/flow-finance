/**
 * @file profile-settings.ts
 * @description Préférences profil : modules visibles et mots-clés de suivi.
 */

export interface ProfileModuleSettings {
  savings: boolean;
  investments: boolean;
  payroll: boolean;
  trackedPerson: boolean;
  trackedOutgoing: boolean;
}

export interface ProfilePayrollSettings {
  keyword: string | null;
  budgetShiftMonths: 0 | 1;
}

/** @deprecated Conservé pour lecture des anciens settings ; préférer trackedIncomeSources. */
export interface ProfileTrackedPersonSettings {
  keyword: string | null;
  label: string | null;
}

/** Destinataire de virements émis suivis (ex. enfant). */
export interface ProfileTrackedOutgoingPerson {
  id: string;
  label: string;
  keyword: string;
}

/**
 * Source de rentrées non salariales (ex. aide familiale).
 * Plusieurs libellés possibles ; hors module salaire.
 */
export interface ProfileTrackedIncomeSource {
  id: string;
  label: string;
  /** Fragments de libellé (OU) — ex. « PASCAL SOPHIE », « MME PASCAL SOPHIE ». */
  keywords: string[];
  /** Si présents dans le libellé, le virement est ignoré (ex. ALUTEC). */
  excludeKeywords: string[];
  /** Montants entiers en euros uniquement (ex. 200,00 €). */
  requireRoundAmount: boolean;
}

export interface ProfileSettings {
  modules: ProfileModuleSettings;
  payroll: ProfilePayrollSettings;
  /** @deprecated Miroir de la 1ʳᵉ source — migration douce. */
  trackedPerson: ProfileTrackedPersonSettings;
  trackedIncomeSources: ProfileTrackedIncomeSource[];
  trackedOutgoingPeople: ProfileTrackedOutgoingPerson[];
}

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  modules: {
    savings: true,
    investments: true,
    payroll: true,
    trackedPerson: true,
    trackedOutgoing: true,
  },
  payroll: {
    keyword: null,
    budgetShiftMonths: 1,
  },
  trackedPerson: {
    keyword: null,
    label: null,
  },
  trackedIncomeSources: [],
  trackedOutgoingPeople: [],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function asBudgetShiftMonths(value: unknown): 0 | 1 {
  return value === 0 || value === "0" ? 0 : 1;
}

function slugId(label: string, seed: string, index: number): string {
  const base = `${label}-${seed}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base.length > 0 ? `${base}-${index}` : `source-${index}`;
}

function normalizeTrackedOutgoingPeople(
  raw: unknown,
): ProfileTrackedOutgoingPerson[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const people: ProfileTrackedOutgoingPerson[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const row = asRecord(raw[index]);
    const keyword = asNullableString(row.keyword);
    if (!keyword) {
      continue;
    }
    const label = asNullableString(row.label) ?? keyword;
    const id = asNullableString(row.id) ?? slugId(label, keyword, index);
    people.push({ id, label, keyword });
  }
  return people;
}

function normalizeTrackedIncomeSources(
  raw: unknown,
  legacyPerson: ProfileTrackedPersonSettings,
): ProfileTrackedIncomeSource[] {
  const sources: ProfileTrackedIncomeSource[] = [];

  if (Array.isArray(raw)) {
    for (let index = 0; index < raw.length; index += 1) {
      const row = asRecord(raw[index]);
      const keywords = asStringList(row.keywords);
      const singleKeyword = asNullableString(row.keyword);
      if (keywords.length === 0 && singleKeyword) {
        keywords.push(singleKeyword);
      }
      if (keywords.length === 0) {
        continue;
      }
      const label = asNullableString(row.label) ?? keywords[0];
      const id =
        asNullableString(row.id) ?? slugId(label, keywords.join("-"), index);
      sources.push({
        id,
        label,
        keywords,
        excludeKeywords: asStringList(row.excludeKeywords),
        requireRoundAmount: asBoolean(row.requireRoundAmount, true),
      });
    }
  }

  if (sources.length === 0 && legacyPerson.keyword) {
    sources.push({
      id: slugId(
        legacyPerson.label ?? legacyPerson.keyword,
        legacyPerson.keyword,
        0,
      ),
      label: legacyPerson.label ?? legacyPerson.keyword,
      keywords: [legacyPerson.keyword],
      excludeKeywords: [],
      requireRoundAmount: true,
    });
  }

  return sources;
}

function legacyTrackedPersonFromSources(
  sources: ProfileTrackedIncomeSource[],
): ProfileTrackedPersonSettings {
  const first = sources[0];
  if (!first) {
    return { keyword: null, label: null };
  }
  return {
    keyword: first.keywords[0] ?? null,
    label: first.label,
  };
}

/** Fusionne un JSON brut (base ou formulaire) avec les defaults mode A. */
export function normalizeProfileSettings(raw: unknown): ProfileSettings {
  const root = asRecord(raw);
  const modules = asRecord(root.modules);
  const payroll = asRecord(root.payroll);
  const trackedPersonRaw = asRecord(root.trackedPerson);
  const legacyPerson: ProfileTrackedPersonSettings = {
    keyword: asNullableString(trackedPersonRaw.keyword),
    label: asNullableString(trackedPersonRaw.label),
  };
  const trackedIncomeSources = normalizeTrackedIncomeSources(
    root.trackedIncomeSources,
    legacyPerson,
  );

  return {
    modules: {
      savings: asBoolean(modules.savings, DEFAULT_PROFILE_SETTINGS.modules.savings),
      investments: asBoolean(
        modules.investments,
        DEFAULT_PROFILE_SETTINGS.modules.investments,
      ),
      payroll: asBoolean(modules.payroll, DEFAULT_PROFILE_SETTINGS.modules.payroll),
      trackedPerson: asBoolean(
        modules.trackedPerson,
        DEFAULT_PROFILE_SETTINGS.modules.trackedPerson,
      ),
      trackedOutgoing: asBoolean(
        modules.trackedOutgoing,
        DEFAULT_PROFILE_SETTINGS.modules.trackedOutgoing,
      ),
    },
    payroll: {
      keyword: asNullableString(payroll.keyword),
      budgetShiftMonths: asBudgetShiftMonths(payroll.budgetShiftMonths),
    },
    trackedPerson: legacyTrackedPersonFromSources(trackedIncomeSources),
    trackedIncomeSources,
    trackedOutgoingPeople: normalizeTrackedOutgoingPeople(
      root.trackedOutgoingPeople,
    ),
  };
}

export function isPayrollConfigured(settings: ProfileSettings): boolean {
  return settings.modules.payroll && Boolean(settings.payroll.keyword);
}

export function isTrackedPersonConfigured(settings: ProfileSettings): boolean {
  return (
    settings.modules.trackedPerson && settings.trackedIncomeSources.length > 0
  );
}

export function isTrackedOutgoingConfigured(settings: ProfileSettings): boolean {
  return (
    settings.modules.trackedOutgoing && settings.trackedOutgoingPeople.length > 0
  );
}

export function getConfiguredIncomeSources(
  settings: ProfileSettings,
): ProfileTrackedIncomeSource[] {
  if (!settings.modules.trackedPerson) {
    return [];
  }
  return settings.trackedIncomeSources;
}

export function getConfiguredOutgoingPeople(
  settings: ProfileSettings,
): ProfileTrackedOutgoingPerson[] {
  if (!settings.modules.trackedOutgoing) {
    return [];
  }
  return settings.trackedOutgoingPeople;
}
