/**
 * @file mobile-nav.tsx
 * @description Navigation mobile (sheet) pour petits écrans.
 */

"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", labelKey: "dashboard" as const },
  { href: "/analytics", labelKey: "analytics" as const },
  { href: "/categories", labelKey: "categories" as const },
  { href: "/savings", labelKey: "savings" as const, module: "savings" as const },
  {
    href: "/investments",
    labelKey: "investments" as const,
    module: "investments" as const,
  },
  { href: "/transactions", labelKey: "transactions" as const },
  { href: "/settings", labelKey: "settings" as const },
];

interface MobileNavProps {
  showSavings?: boolean;
  showInvestments?: boolean;
}

export function MobileNav({
  showSavings = true,
  showInvestments = true,
}: MobileNavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visibleItems = navItems.filter((item) => {
    if (item.module === "savings") return showSavings;
    if (item.module === "investments") return showInvestments;
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="cursor-pointer md:hidden"
          aria-label="Menu"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground">
        <SheetHeader>
          <SheetTitle className="text-sidebar-foreground">Flow Finance</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">
          {visibleItems.map(({ href, labelKey }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "bg-sidebar-accent"
                    : "hover:bg-sidebar-accent/60",
                )}
              >
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
