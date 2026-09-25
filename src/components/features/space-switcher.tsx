/**
 * @file space-switcher.tsx
 * @description Bascule d'espace, en tête de toutes les pages du dashboard.
 */

"use client";

import { Check, ChevronDown, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setActiveSpaceAction } from "@/app/actions/spaces";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Space } from "@/types/database";

interface SpaceSwitcherProps {
  spaces: Space[];
  activeSpaceId: string | null;
}

export function SpaceSwitcher({ spaces, activeSpaceId }: SpaceSwitcherProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Un seul espace : la bascule n'aurait rien à proposer.
  if (spaces.length < 2) {
    return null;
  }

  const active = spaces.find((space) => space.id === activeSpaceId) ?? spaces[0];

  function select(spaceId: string) {
    if (spaceId === active.id) {
      return;
    }
    const formData = new FormData();
    formData.set("spaceId", spaceId);
    startTransition(async () => {
      const result = await setActiveSpaceAction(formData);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className="inline-flex h-9 max-w-[14rem] cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={t("spaceSwitchLabel")}
        >
          {active.kind === "shared" ? (
            <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate">{active.name}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{t("spaceSwitchLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {spaces.map((space) => (
          <DropdownMenuItem
            key={space.id}
            className="cursor-pointer"
            onClick={() => select(space.id)}
          >
            <span className="flex w-full items-center gap-2">
              {space.kind === "shared" ? (
                <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{space.name}</span>
              <Check
                className={cn(
                  "size-4 shrink-0",
                  space.id === active.id ? "opacity-100" : "opacity-0",
                )}
                aria-hidden
              />
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
