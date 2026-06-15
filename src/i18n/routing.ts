/**
 * @file routing.ts
 * @description Configuration des locales et du routage i18n pour Flow Finance.
 * Utilisé par le middleware next-intl et les helpers de navigation.
 */

import { defineRouting } from "next-intl/routing";

/** Locales supportées par l'application. */
export const locales = ["fr", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
