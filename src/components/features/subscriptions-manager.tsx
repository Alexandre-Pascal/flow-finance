/**
 * @file subscriptions-manager.tsx
 * @description Gestion des abonnements et prélèvements récurrents.
 */

"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  archiveRecurringPaymentAction,
  createRecurringPaymentAction,
  deleteRecurringPaymentAction,
  mergeRecurringPaymentsAction,
  updateRecurringPaymentCadenceAction,
} from "@/app/actions/recurring-payments";
import { SubscriptionSuggestionSection } from "@/components/features/subscription-suggestion-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  groupRulesByCanonical,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import { cn } from "@/lib/utils";
import type { RecurringCadence, RecurringPayment } from "@/types/database";

interface SubscriptionsManagerProps {
  subscriptions: RecurringPayment[];
  paypalSuggestions: RecurringClusterSuggestion[];
  generalSuggestions: RecurringClusterSuggestion[];
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
}

function subscriptionMeta(
  subscription: RecurringPayment,
  t: ReturnType<typeof useTranslations<"subscriptions">>,
  locale: string,
): string {
  const amount = formatCurrency(-subscription.amount, locale);

  if (subscription.cadence === "yearly") {
    return subscription.billing_month && subscription.billing_day
      ? t(
          subscription.amount_flexible
            ? "subscriptionMetaYearlyFlexible"
            : "subscriptionMetaYearly",
          {
            amount,
            month: subscription.billing_month,
            day: subscription.billing_day,
          },
        )
      : t(
          subscription.amount_flexible
            ? "subscriptionMetaYearlyShortFlexible"
            : "subscriptionMetaYearlyShort",
          { amount },
        );
  }

  if (subscription.cadence === "semiannual") {
    return t(
      subscription.amount_flexible
        ? "subscriptionMetaSemiannualFlexible"
        : "subscriptionMetaSemiannual",
      {
        amount,
        pattern: subscription.description_pattern,
      },
    );
  }

  if (subscription.description_pattern.toUpperCase().includes("PAYPAL")) {
    return subscription.billing_day
      ? t("subscriptionMetaWithDay", { amount, day: subscription.billing_day })
      : t("subscriptionMeta", { amount });
  }

  return subscription.billing_day
    ? t(
        subscription.amount_flexible
          ? "subscriptionMetaGeneralWithDayFlexible"
          : "subscriptionMetaGeneralWithDay",
        {
          amount,
          day: subscription.billing_day,
          pattern: subscription.description_pattern,
        },
      )
    : t(
        subscription.amount_flexible
          ? "subscriptionMetaGeneralFlexible"
          : "subscriptionMetaGeneral",
        {
          amount,
          pattern: subscription.description_pattern,
        },
      );
}

interface SubscriptionRowProps {
  subscription: RecurringPayment;
  /** Abonnements auxquels cette règle peut être rattachée. */
  mergeTargets: RecurringPayment[];
  /** Variante de libellé rattachée à un abonnement : le nom est déjà affiché au-dessus. */
  isVariant: boolean;
  isDemo: boolean;
  isPending: boolean;
  locale: string;
  onCadenceChange: (id: string, cadence: RecurringCadence) => void;
  onMerge: (id: string, targetId: string) => void;
  onArchive: (id: string, restore: boolean) => void;
  onDelete: (id: string) => void;
}

function SubscriptionRow({
  subscription,
  mergeTargets,
  isVariant,
  isDemo,
  isPending,
  locale,
  onCadenceChange,
  onMerge,
  onArchive,
  onDelete,
}: SubscriptionRowProps) {
  const t = useTranslations("subscriptions");
  const isArchived = Boolean(subscription.active_to);

  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3",
        isVariant && "border-dashed bg-muted/30",
      )}
    >
      <div className="min-w-0">
        {isVariant ? null : (
          <p className="font-medium text-foreground">{subscription.name}</p>
        )}
        <p className="truncate text-sm text-muted-foreground">
          {subscriptionMeta(subscription, t, locale)}
        </p>
        {isArchived ? (
          <p className="text-xs text-muted-foreground">
            {t("archivedHint", {
              date: formatDate(subscription.active_to as string, locale),
            })}
          </p>
        ) : null}
      </div>

      {isDemo ? null : (
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-wrap rounded-md border border-border p-0.5">
            {(
              [
                ["monthly", "cadenceMonthly"],
                ["semiannual", "cadenceSemiannual"],
                ["yearly", "cadenceYearly"],
              ] as const
            ).map(([value, labelKey]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={subscription.cadence === value ? "default" : "ghost"}
                className="h-7 cursor-pointer px-2 text-xs"
                disabled={isPending}
                onClick={() => onCadenceChange(subscription.id, value)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                disabled={isPending}
                aria-label={t("mergeWith")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t("mergeWith")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={!subscription.merged_into_id}
                onCheckedChange={() => onMerge(subscription.id, "")}
                className="cursor-pointer"
              >
                {t("mergeNone")}
              </DropdownMenuCheckboxItem>
              {mergeTargets.map((target) => (
                <DropdownMenuCheckboxItem
                  key={target.id}
                  checked={subscription.merged_into_id === target.id}
                  onCheckedChange={() => onMerge(subscription.id, target.id)}
                  className="cursor-pointer"
                >
                  {target.name}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onArchive(subscription.id, isArchived)}
              >
                {isArchived ? t("restore") : t("archive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-destructive"
                onClick={() => onDelete(subscription.id)}
              >
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}

export function SubscriptionsManager({
  subscriptions,
  paypalSuggestions,
  generalSuggestions,
  locale,
  isDemo,
  schemaReady,
}: SubscriptionsManagerProps) {
  const t = useTranslations("subscriptions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualPattern, setManualPattern] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCadence, setManualCadence] = useState<RecurringCadence>("monthly");
  const [manualFlexible, setManualFlexible] = useState(true);

  const groups = useMemo(
    () => groupRulesByCanonical(subscriptions),
    [subscriptions],
  );
  const canonicalSubscriptions = useMemo(
    () => groups.map((group) => group.canonical),
    [groups],
  );

  function runAction(
    action: (formData: FormData) => Promise<{
      error?: string;
      success?: true;
      warning?: string;
    }>,
    formData: FormData,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error === "schema") {
        setError(t("schemaError"));
        return;
      }
      if (result.error) {
        setError(t("saveError"));
        return;
      }
      if (result.warning === "rematch") {
        setError(t("rematchWarning"));
      }
      router.refresh();
    });
  }

  function handleCadenceChange(id: string, cadence: RecurringCadence) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("cadence", cadence);
    runAction(updateRecurringPaymentCadenceAction, formData);
  }

  function handleMerge(id: string, targetId: string) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("targetId", targetId);
    runAction(mergeRecurringPaymentsAction, formData);
  }

  function handleArchive(id: string, restore: boolean) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("restore", restore ? "1" : "");
    runAction(archiveRecurringPaymentAction, formData);
  }

  function handleDelete(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    runAction(deleteRecurringPaymentAction, formData);
  }

  function handleManualCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", manualName.trim());
    formData.set("description_pattern", manualPattern.trim());
    formData.set("cadence", manualCadence);
    if (manualAmount.trim()) {
      formData.set("amount", manualAmount.trim());
    }
    if (manualFlexible) {
      formData.set("amount_flexible", "1");
    }

    startTransition(async () => {
      const result = await createRecurringPaymentAction(formData);
      if (result.error === "demo") {
        setError(t("demoError"));
        return;
      }
      if (result.error === "schema") {
        setError(t("schemaError"));
        return;
      }
      if (result.error === "inactive") {
        setError(t("inactiveError"));
        return;
      }
      if (result.error) {
        setError(t("saveError"));
        return;
      }
      if ("warning" in result && result.warning === "rematch") {
        setError(t("rematchWarning"));
      }
      setManualName("");
      setManualPattern("");
      setManualAmount("");
      setManualCadence("monthly");
      setManualFlexible(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isDemo ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {t("demoHint")}
          </p>
        ) : null}

        {!isDemo && !schemaReady ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("schemaError")}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!isDemo && schemaReady ? (
          <form
            onSubmit={handleManualCreate}
            className="space-y-4 rounded-lg border border-border p-4"
          >
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("addTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("manualDescription")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-charge-name">{t("nameLabel")}</Label>
                <Input
                  id="manual-charge-name"
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder={t("namePlaceholder")}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-charge-pattern">{t("patternLabel")}</Label>
                <Input
                  id="manual-charge-pattern"
                  value={manualPattern}
                  onChange={(event) => setManualPattern(event.target.value)}
                  placeholder={t("patternPlaceholder")}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-charge-amount">{t("amountLabel")}</Label>
                <Input
                  id="manual-charge-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={manualAmount}
                  onChange={(event) => setManualAmount(event.target.value)}
                  placeholder={t("amountPlaceholder")}
                  required={!manualFlexible}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("cadenceLabel")}</Label>
                <div className="flex w-fit flex-wrap rounded-md border border-border p-0.5">
                  {(
                    [
                      ["monthly", "cadenceMonthly"],
                      ["semiannual", "cadenceSemiannual"],
                      ["yearly", "cadenceYearly"],
                    ] as const
                  ).map(([value, labelKey]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={manualCadence === value ? "default" : "ghost"}
                      className="h-7 cursor-pointer px-2 text-xs"
                      disabled={isPending}
                      onClick={() => setManualCadence(value)}
                    >
                      {t(labelKey)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 cursor-pointer"
                checked={manualFlexible}
                disabled={isPending}
                onChange={(event) => setManualFlexible(event.target.checked)}
              />
              <span>{t("amountFlexibleLabel")}</span>
            </label>
            <p className="text-xs text-muted-foreground">{t("amountFlexibleHint")}</p>

            <Button
              type="submit"
              className="cursor-pointer"
              disabled={
                isPending ||
                !manualName.trim() ||
                !manualPattern.trim() ||
                (!manualFlexible && !manualAmount.trim())
              }
            >
              <Plus className="size-4" aria-hidden />
              {t("addButton")}
            </Button>
          </form>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("listTitle")}</p>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {groups.map((group) => (
                <li key={group.canonical.id} className="space-y-2">
                  <ul>
                    <SubscriptionRow
                      subscription={group.canonical}
                      mergeTargets={canonicalSubscriptions.filter(
                        (option) => option.id !== group.canonical.id,
                      )}
                      isVariant={false}
                      isDemo={isDemo}
                      isPending={isPending}
                      locale={locale}
                      onCadenceChange={handleCadenceChange}
                      onMerge={handleMerge}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                    />
                  </ul>

                  {group.variants.length > 0 ? (
                    <div className="space-y-2 pl-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("variantsTitle")}
                      </p>
                      <ul className="space-y-2">
                        {group.variants.map((variant) => (
                          <SubscriptionRow
                            key={variant.id}
                            subscription={variant}
                            mergeTargets={canonicalSubscriptions.filter(
                              (option) => option.id !== variant.id,
                            )}
                            isVariant
                            isDemo={isDemo}
                            isPending={isPending}
                            locale={locale}
                            onCadenceChange={handleCadenceChange}
                            onMerge={handleMerge}
                            onArchive={handleArchive}
                            onDelete={handleDelete}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {!isDemo && groups.length > 1 ? (
            <p className="text-xs text-muted-foreground">{t("mergeHint")}</p>
          ) : null}
        </div>

        <SubscriptionSuggestionSection
          sectionId="paypal"
          title={t("paypalSectionTitle")}
          description={t("paypalSectionDescription")}
          pickClusterHint={t("paypalPickClusterHint")}
          noSuggestionsLabel={t("noPaypalSuggestions")}
          suggestions={paypalSuggestions}
          locale={locale}
          isDemo={isDemo}
          schemaReady={schemaReady}
          onError={setError}
        />

        <SubscriptionSuggestionSection
          sectionId="general"
          title={t("generalSectionTitle")}
          description={t("generalSectionDescription")}
          pickClusterHint={t("generalPickClusterHint")}
          noSuggestionsLabel={t("noGeneralSuggestions")}
          suggestions={generalSuggestions}
          locale={locale}
          isDemo={isDemo}
          schemaReady={schemaReady}
          onError={setError}
        />
      </CardContent>
    </Card>
  );
}
