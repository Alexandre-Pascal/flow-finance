/**
 * @file mark-as-subscription-dialog.tsx
 * @description Marquage manuel d'une transaction comme abonnement, avec option
 * de rattachement à un abonnement existant (service ayant changé de libellé).
 */

"use client";

import { Repeat } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { createSubscriptionFromTransactionAction } from "@/app/actions/recurring-payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generalRecurringMatchPattern,
  GENERAL_RECURRING_AMOUNT_TOLERANCE,
  recurringGroupKey,
} from "@/lib/finance/recurring-labels";
import {
  DEFAULT_PAYPAL_PATTERN,
  getBookingDay,
  getBookingMonth,
  listCanonicalRules,
  matchesRecurringPayment,
} from "@/lib/finance/recurring-payments";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  RecurringCadence,
  RecurringPayment,
  TransactionWithAccount,
} from "@/types/database";

const CREATE_MODE = "create";

interface MarkAsSubscriptionDialogProps {
  tx: TransactionWithAccount;
  transactions: TransactionWithAccount[];
  subscriptions: RecurringPayment[];
  locale: string;
}

function toDisplayName(pattern: string): string {
  return pattern
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function MarkAsSubscriptionDialog({
  tx,
  transactions,
  subscriptions,
  locale,
}: MarkAsSubscriptionDialogProps) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<RecurringCadence>("monthly");
  const [target, setTarget] = useState<string>(CREATE_MODE);
  const [name, setName] = useState("");
  const [amountFlexible, setAmountFlexible] = useState(false);

  const canonicalSubscriptions = useMemo(
    () => listCanonicalRules(subscriptions),
    [subscriptions],
  );

  const isPayPal = tx.description
    .toUpperCase()
    .includes(DEFAULT_PAYPAL_PATTERN);
  const pattern = isPayPal
    ? DEFAULT_PAYPAL_PATTERN
    : generalRecurringMatchPattern(recurringGroupKey(tx.description));

  // L'aperçu utilise exactement la règle que l'action serveur va créer, pour que
  // le nombre annoncé corresponde au rattachement réel.
  const matchedDates = useMemo(() => {
    if (!pattern) {
      return [];
    }

    const candidate: RecurringPayment = {
      id: "candidate",
      user_id: "",
      name: "",
      amount: Math.round(Math.abs(tx.amount) * 100) / 100,
      amount_tolerance: isPayPal ? 0.05 : GENERAL_RECURRING_AMOUNT_TOLERANCE,
      amount_flexible: !isPayPal && amountFlexible,
      description_pattern: pattern,
      billing_day: getBookingDay(tx.booking_date),
      cadence,
      billing_month:
        cadence === "yearly" ? getBookingMonth(tx.booking_date) : null,
      merged_into_id: null,
      active_to: null,
      created_at: "",
      updated_at: "",
    };

    return transactions
      .filter(
        (candidateTx) =>
          !candidateTx.recurring_payment_id &&
          matchesRecurringPayment(candidateTx, candidate),
      )
      .map((candidateTx) => candidateTx.booking_date)
      .sort();
  }, [
    amountFlexible,
    cadence,
    isPayPal,
    pattern,
    transactions,
    tx.amount,
    tx.booking_date,
  ]);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(toDisplayName(pattern));
      setTarget(CREATE_MODE);
      setCadence("monthly");
      setAmountFlexible(false);
      setError(null);
    }
    setOpen(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("cadence", cadence);
    if (amountFlexible && !isPayPal) {
      formData.set("amount_flexible", "1");
    }

    if (target === CREATE_MODE) {
      formData.set("name", name.trim());
    } else {
      formData.set("attachToId", target);
    }

    startTransition(async () => {
      const result = await createSubscriptionFromTransactionAction(formData);

      if (result.error === "schema") {
        setError(t("subscriptionSchemaError"));
        return;
      }
      if (result.error) {
        setError(t("subscriptionSaveError"));
        return;
      }
      if (result.warning === "rematch") {
        setError(t("subscriptionRematchWarning"));
        router.refresh();
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  const isCreating = target === CREATE_MODE;
  const canSubmit = isCreating ? name.trim().length > 0 : Boolean(target);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("markAsSubscription")}
          title={t("markAsSubscription")}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <Repeat className="size-3.5" aria-hidden />
        </button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          <DialogHeader className="mb-4">
            <DialogTitle>{t("subscriptionDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("subscriptionDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <form id={`mark-subscription-${tx.id}`} onSubmit={handleSubmit} className="space-y-4">
          <div className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="break-words font-medium text-foreground" title={tx.description}>
              {tx.description}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(tx.amount, locale, tx.currency)} ·{" "}
              {formatDate(tx.booking_date, locale)}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {t("subscriptionPatternLabel")} : <code>{pattern}</code>
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-foreground">
              {t("subscriptionMatchCount", { count: matchedDates.length })}
            </p>
            {matchedDates.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                {t("subscriptionMatchRange", {
                  from: formatDate(matchedDates[0], locale),
                  to: formatDate(matchedDates[matchedDates.length - 1], locale),
                })}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`subscription-target-${tx.id}`}>
              {t("subscriptionAttachLabel")}
            </Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger
                id={`subscription-target-${tx.id}`}
                className="w-full cursor-pointer"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={CREATE_MODE} className="cursor-pointer">
                  {t("subscriptionModeCreate")}
                </SelectItem>
                {canonicalSubscriptions.map((subscription) => (
                  <SelectItem
                    key={subscription.id}
                    value={subscription.id}
                    className="cursor-pointer"
                  >
                    {subscription.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canonicalSubscriptions.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("subscriptionAttachHint")}
              </p>
            ) : null}
          </div>

          {isCreating ? (
            <div className="space-y-2">
              <Label htmlFor={`subscription-new-name-${tx.id}`}>
                {t("subscriptionModeCreate")}
              </Label>
              <Input
                id={`subscription-new-name-${tx.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>{t("subscriptionCadenceLabel")}</Label>
            <div className="flex w-fit rounded-md border border-border p-0.5">
              {(["monthly", "yearly"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={cadence === value ? "default" : "ghost"}
                  className="h-7 cursor-pointer px-3 text-xs"
                  onClick={() => setCadence(value)}
                >
                  {value === "monthly"
                    ? t("subscriptionCadenceMonthly")
                    : t("subscriptionCadenceYearly")}
                </Button>
              ))}
            </div>
          </div>

          {!isPayPal && isCreating ? (
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer"
                  checked={amountFlexible}
                  onChange={(event) => setAmountFlexible(event.target.checked)}
                />
                <span>{t("subscriptionAmountFlexible")}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {t("subscriptionAmountFlexibleHint")}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          </form>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="cursor-pointer">
              {t("subscriptionCancel")}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            form={`mark-subscription-${tx.id}`}
            className="cursor-pointer"
            disabled={isPending || !canSubmit || !pattern}
          >
            {isCreating
              ? t("subscriptionSubmitCreate")
              : t("subscriptionSubmitAttach")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
