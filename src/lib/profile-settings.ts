/**
 * @file profile-settings.ts
 * @description Préférences profil : modules visibles et mots-clés de suivi.
 */

export interface ProfileModuleSettings {
  savings: boolean;
  investments: boolean;
  payroll: boolean;
  trackedPerson: boolean;
}

export interface ProfilePayrollSettings {
  keyword: string | null;
  budgetShiftMonths: 0 | 1;
}

export interface ProfileTrackedPersonSettings {
  keyword: string | null;
  label: string | null;
}

export interface ProfileSettings {
  modules: ProfileModuleSettings;
  payroll: ProfilePayrollSettings;
  trackedPerson: ProfileTrackedPersonSettings;
}

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  modules: {
    savings: true,
    investments: true,
    payroll: true,
    trackedPerson: true,
  },
  payroll: {
    keyword: null,
    budgetShiftMonths: 1,
  },
  trackedPerson: {
    keyword: null,
    label: null,
  },
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
    },
    payroll: {
      keyword: asNullableString(payroll.keyword),
      budgetShiftMonths: asBudgetShiftMonths(payroll.budgetShiftMonths),
    },
    trackedPerson: {
      keyword: asNullableString(trackedPerson.keyword),
      label: asNullableString(trackedPerson.label),
    },
  };
}

export function isPayrollConfigured(settings: ProfileSettings): boolean {
  return settings.modules.payroll && Boolean(settings.payroll.keyword);
}

export function isTrackedPersonConfigured(settings: ProfileSettings): boolean {
  return settings.modules.trackedPerson && Boolean(settings.trackedPerson.keyword);
}
