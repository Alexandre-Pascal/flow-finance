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

export interface ProfileSettings {
  modules: ProfileModuleSettings;
  payroll: ProfilePayrollSettings;
  trackedPerson: ProfileTrackedPersonSettings;
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

function asBudgetShiftMonths(value: unknown): 0 | 1 {
  return value === 0 || value === "0" ? 0 : 1;
}

function slugId(label: string, keyword: string, index: number): string {
  const base = `${label}-${keyword}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base.length > 0 ? `${base}-${index}` : `outgoing-${index}`;
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

/** Fusionne un JSON brut (base ou formulaire) avec les defaults mode A. */
export function normalizeProfileSettings(raw: unknown): ProfileSettings {
  const root = asRecord(raw);
  const modules = asRecord(root.modules);
  const payroll = asRecord(root.payroll);
  const trackedPerson = asRecord(root.trackedPerson);

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
    trackedPerson: {
      keyword: asNullableString(trackedPerson.keyword),
      label: asNullableString(trackedPerson.label),
    },
    trackedOutgoingPeople: normalizeTrackedOutgoingPeople(
      root.trackedOutgoingPeople,
    ),
  };
}

export function isPayrollConfigured(settings: ProfileSettings): boolean {
  return settings.modules.payroll && Boolean(settings.payroll.keyword);
}

export function isTrackedPersonConfigured(settings: ProfileSettings): boolean {
  return settings.modules.trackedPerson && Boolean(settings.trackedPerson.keyword);
}

export function isTrackedOutgoingConfigured(settings: ProfileSettings): boolean {
  return (
    settings.modules.trackedOutgoing && settings.trackedOutgoingPeople.length > 0
  );
}

export function getConfiguredOutgoingPeople(
  settings: ProfileSettings,
): ProfileTrackedOutgoingPerson[] {
  if (!settings.modules.trackedOutgoing) {
    return [];
  }
  return settings.trackedOutgoingPeople;
}
