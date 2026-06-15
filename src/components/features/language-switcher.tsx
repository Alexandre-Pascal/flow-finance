/**
 * @file language-switcher.tsx
 * @description Sélecteur de langue FR / EN dans les paramètres.
 */

"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        router.replace(pathname, { locale: value });
      }}
    >
      <SelectTrigger className="w-40 cursor-pointer">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fr" className="cursor-pointer">
          Français
        </SelectItem>
        <SelectItem value="en" className="cursor-pointer">
          English
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
