/**
 * @file investments-tabs.tsx
 * @description Navigation PEA / Crypto dans la section Investissements.
 * Deux cartes cliquables, plus lisibles qu'un petit segmented control.
 */

"use client";

import { Bitcoin, LineChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  {
    value: "pea",
    href: "/investments/pea" as const,
    labelKey: "tabPea" as const,
    hintKey: "tabPeaHint" as const,
    icon: LineChart,
  },
  {
    value: "crypto",
    href: "/investments/crypto" as const,
    labelKey: "tabCrypto" as const,
    hintKey: "tabCryptoHint" as const,
    icon: Bitcoin,
  },
];

export function InvestmentsTabs() {
  const t = useTranslations("investments");
  const pathname = usePathname();

  const active =
    TABS.find((tab) => pathname.startsWith(tab.href))?.value ?? "pea";

  return (
    <nav
      aria-label={t("title")}
      className="grid gap-3 sm:grid-cols-2"
    >
      {TABS.map(({ value, href, labelKey, hintKey, icon: Icon }) => {
        const isActive = value === active;

        return (
          <Link
            key={value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-200",
              isActive
                ? "border-foreground/15 bg-muted text-foreground shadow-sm"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                isActive
                  ? "bg-background text-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                {t(labelKey)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t(hintKey)}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
