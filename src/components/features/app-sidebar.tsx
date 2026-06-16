/**
 * @file app-sidebar.tsx
 * @description Navigation latérale du dashboard Flow Finance.
 */

"use client";

import {
  LayoutDashboard,
  ArrowLeftRight,
  Settings,
  TrendingUp,
  BarChart3,
  PieChart,
  PiggyBank,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, labelKey: "dashboard" as const },
  { href: "/analytics", icon: BarChart3, labelKey: "analytics" as const },
  { href: "/categories", icon: PieChart, labelKey: "categories" as const },
  { href: "/savings", icon: PiggyBank, labelKey: "savings" as const },
  {
    href: "/transactions",
    icon: ArrowLeftRight,
    labelKey: "transactions" as const,
  },
  { href: "/settings", icon: Settings, labelKey: "settings" as const },
];

export function AppSidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <TrendingUp className="size-5" aria-hidden />
        </div>
        <span className="text-lg font-semibold tracking-tight">
          Flow Finance
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4" aria-label="Main">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
