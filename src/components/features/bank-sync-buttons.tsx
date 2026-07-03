/**
 * @file bank-sync-buttons.tsx
 * @description Boutons de synchronisation bancaire avec état de chargement.
 */

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BankSyncButtons() {
  const t = useTranslations("settings");
  const [pending, setPending] = useState<"quick" | "full" | null>(null);

  function handleSubmit(mode: "quick" | "full") {
    setPending(mode);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <form action="/api/bank/sync" method="post" onSubmit={() => handleSubmit("quick")}>
        <Button
          type="submit"
          variant="outline"
          className="cursor-pointer"
          disabled={pending !== null}
        >
          {pending === "quick" ? t("syncing") : t("syncNow")}
        </Button>
      </form>
      <form
        action="/api/bank/sync?full=1"
        method="post"
        onSubmit={() => handleSubmit("full")}
      >
        <Button
          type="submit"
          variant="ghost"
          className="cursor-pointer"
          disabled={pending !== null}
        >
          {pending === "full" ? t("syncingFull") : t("syncFull")}
        </Button>
      </form>
    </div>
  );
}
