/**
 * @file demo-banner.tsx
 * @description Bandeau informatif affiché en mode démo (sans Supabase).
 */

"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

export function DemoBanner() {
  const t = useTranslations("common");

  return (
    <div
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <Info className="size-4 shrink-0" aria-hidden />
      <span>{t("demoMode")}</span>
    </div>
  );
}
