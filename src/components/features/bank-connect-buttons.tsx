/**
 * @file bank-connect-buttons.tsx
 * @description Choix de la banque puis démarrage OAuth Enable Banking.
 */

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CONNECT_ASPSPS } from "@/lib/enable-banking/aspsps";

export function BankConnectButtons({
  connected = false,
}: {
  /** Une banque est déjà reliée : on propose d'en ajouter une autre. */
  connected?: boolean;
}) {
  const t = useTranslations("settings");
  const [aspspId, setAspspId] = useState(CONNECT_ASPSPS[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  return (
    <form
      action={`/api/bank/connect?aspsp=${encodeURIComponent(aspspId)}`}
      method="get"
      className="space-y-3"
      onSubmit={() => setPending(true)}
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("aspspPickHint")}</p>
        <div className="flex flex-wrap gap-2">
          {CONNECT_ASPSPS.map((aspsp) => (
            <Button
              key={aspsp.id}
              type="button"
              size="sm"
              variant={aspspId === aspsp.id ? "default" : "outline"}
              className="h-auto cursor-pointer whitespace-normal px-3 py-2 text-left text-xs"
              disabled={pending}
              onClick={() => setAspspId(aspsp.id)}
            >
              {aspsp.name}
            </Button>
          ))}
        </div>
      </div>
      <Button
        type="submit"
        className="cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90"
        disabled={pending || !aspspId}
      >
        {pending
          ? t("connectingBank")
          : connected
            ? t("connectAnotherBank")
            : t("connectBank")}
      </Button>
    </form>
  );
}
