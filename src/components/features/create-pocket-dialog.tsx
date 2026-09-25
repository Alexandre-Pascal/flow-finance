/**
 * @file create-pocket-dialog.tsx
 * @description Création d'un compte à partir d'un virement non reconnu — les
 * pockets Revolut, que la banque n'expose pas.
 */

"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { createManualAccountAction } from "@/app/actions/accounts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestTransferKeyword } from "@/lib/finance/account-transfers";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TransactionWithAccount } from "@/types/database";

interface CreatePocketDialogProps {
  tx: TransactionWithAccount;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePocketDialog({
  tx,
  locale,
  open,
  onOpenChange,
}: CreatePocketDialogProps) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState(() =>
    suggestTransferKeyword(tx.description),
  );
  const [baseBalance, setBaseBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setKeyword(suggestTransferKeyword(tx.description));
      setBaseBalance("0");
      setError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("keyword", keyword.trim());
    formData.set("baseBalance", baseBalance.trim() || "0");

    startTransition(async () => {
      const result = await createManualAccountAction(formData);
      if (result.error === "schema") {
        setError(t("pocketSchemaError"));
        return;
      }
      if (result.error) {
        setError(t("pocketSaveError"));
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pocketTitle")}</DialogTitle>
          <DialogDescription>{t("pocketDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="break-all text-sm font-medium text-foreground">
              {tx.description}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(tx.amount, locale, tx.currency)} ·{" "}
              {formatDate(tx.booking_date, locale)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pocket-name">{t("pocketNameLabel")}</Label>
            <Input
              id="pocket-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("pocketNamePlaceholder")}
              disabled={isPending}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pocket-keyword">{t("pocketKeywordLabel")}</Label>
            <Input
              id="pocket-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="font-mono text-xs"
              disabled={isPending}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("pocketKeywordHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pocket-base">{t("pocketBaseLabel")}</Label>
            <Input
              id="pocket-base"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={baseBalance}
              onChange={(event) => setBaseBalance(event.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {t("pocketBaseHint")}
            </p>
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("pocketCancel")}
            </Button>
            <Button
              type="submit"
              className="cursor-pointer"
              disabled={isPending || !name.trim() || keyword.trim().length < 3}
            >
              {t("pocketSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
