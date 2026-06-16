/**
 * @file subscriptions-manager.tsx
 * @description Gestion des abonnements et prélèvements récurrents.
 */

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  createRecurringPaymentAction,
  deleteRecurringPaymentAction,
} from "@/app/actions/recurring-payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  clusterSuggestionKey,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import type { RecurringPayment } from "@/types/database";

interface SubscriptionsManagerProps {
  subscriptions: RecurringPayment[];
  suggestions: RecurringClusterSuggestion[];
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
}

function suggestionLabel(
  suggestion: RecurringClusterSuggestion,
  t: ReturnType<typeof useTranslations<"subscriptions">>,
  locale: string,
): string {
  if (suggestion.source === "paypal") {
    return t("clusterLabelPaypal", {
      amount: formatCurrency(-suggestion.amount, locale),
      day: suggestion.billingDay,
      count: suggestion.count,
    });
  }

  if (suggestion.cadence === "yearly") {
    return t("clusterLabelYearly", {
      amount: formatCurrency(-suggestion.amount, locale),
      preview: suggestion.descriptionPreview,
      month: suggestion.billingMonth ?? 1,
      day: suggestion.billingDay,
      count: suggestion.count,
    });
  }

  return t("clusterLabelMonthly", {
    amount: formatCurrency(-suggestion.amount, locale),
    preview: suggestion.descriptionPreview,
    day: suggestion.billingDay,
    count: suggestion.count,
  });
}

function subscriptionMeta(
  subscription: RecurringPayment,
  t: ReturnType<typeof useTranslations<"subscriptions">>,
  locale: string,
): string {
  const amount = formatCurrency(-subscription.amount, locale);

  if (subscription.cadence === "yearly") {
    return subscription.billing_month && subscription.billing_day
      ? t("subscriptionMetaYearly", {
          amount,
          month: subscription.billing_month,
          day: subscription.billing_day,
        })
      : t("subscriptionMetaYearlyShort", { amount });
  }

  if (subscription.description_pattern.toUpperCase().includes("PAYPAL")) {
    return subscription.billing_day
      ? t("subscriptionMetaWithDay", { amount, day: subscription.billing_day })
      : t("subscriptionMeta", { amount });
  }

  return subscription.billing_day
    ? t("subscriptionMetaGeneralWithDay", {
        amount,
        day: subscription.billing_day,
        pattern: subscription.description_pattern,
      })
    : t("subscriptionMetaGeneral", {
        amount,
        pattern: subscription.description_pattern,
      });
}

export function SubscriptionsManager({
  subscriptions,
  suggestions,
  locale,
  isDemo,
  schemaReady,
}: SubscriptionsManagerProps) {
  const t = useTranslations("subscriptions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedClusterKey, setSelectedClusterKey] = useState(
    suggestions[0] ? clusterSuggestionKey(suggestions[0]) : "",
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedSuggestion = suggestions.find(
    (suggestion) => clusterSuggestionKey(suggestion) === selectedClusterKey,
  );

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
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
        router.refresh();
        return;
      }
      setName("");
      setError(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await deleteRecurringPaymentAction(formData);
      if (result.error === "schema") {
        setError(t("schemaError"));
        return;
      }
      if (result.error) {
        setError(t("saveError"));
      }
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
          <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">{t("addTitle")}</p>

            {suggestions.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="subscription-amount">{t("pickCluster")}</Label>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => {
                    const key = clusterSuggestionKey(suggestion);
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={selectedClusterKey === key ? "default" : "outline"}
                        className="h-auto max-w-full cursor-pointer whitespace-normal py-2 text-left"
                        onClick={() => setSelectedClusterKey(key)}
                      >
                        {suggestionLabel(suggestion, t, locale)}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{t("pickClusterHint")}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noSuggestions")}</p>
            )}

            <input
              type="hidden"
              name="amount"
              value={selectedSuggestion ? String(selectedSuggestion.amount) : ""}
            />
            <input
              type="hidden"
              name="billing_day"
              value={selectedSuggestion ? String(selectedSuggestion.billingDay) : ""}
            />
            <input
              type="hidden"
              name="billing_month"
              value={
                selectedSuggestion?.billingMonth
                  ? String(selectedSuggestion.billingMonth)
                  : ""
              }
            />
            <input
              type="hidden"
              name="cadence"
              value={selectedSuggestion?.cadence ?? "monthly"}
            />
            <input
              type="hidden"
              name="description_pattern"
              value={selectedSuggestion?.descriptionPattern ?? "PAYPAL"}
            />

            <div className="space-y-2">
              <Label htmlFor="subscription-name">{t("nameLabel")}</Label>
              <Input
                id="subscription-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                required
              />
            </div>

            <Button
              type="submit"
              className="cursor-pointer"
              disabled={
                isPending || !selectedSuggestion || !name.trim()
              }
            >
              <Plus className="size-4" aria-hidden />
              {t("addButton")}
            </Button>
          </form>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("listTitle")}</p>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{subscription.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {subscriptionMeta(subscription, t, locale)}
                    </p>
                  </div>
                  {!isDemo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="cursor-pointer text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => handleDelete(subscription.id)}
                      aria-label={t("delete")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {suggestions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("unidentifiedTitle")}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {suggestions.map((suggestion) => (
                <li
                  key={clusterSuggestionKey(suggestion)}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {suggestion.source === "paypal"
                      ? t("unidentifiedClusterPaypal", {
                          amount: formatCurrency(-suggestion.amount, locale),
                          day: suggestion.billingDay,
                        })
                      : suggestion.cadence === "yearly"
                        ? t("unidentifiedClusterYearly", {
                            amount: formatCurrency(-suggestion.amount, locale),
                            preview: suggestion.descriptionPreview,
                            month: suggestion.billingMonth ?? 1,
                            day: suggestion.billingDay,
                          })
                        : t("unidentifiedClusterMonthly", {
                            amount: formatCurrency(-suggestion.amount, locale),
                            preview: suggestion.descriptionPreview,
                            day: suggestion.billingDay,
                          })}
                  </span>
                  <span className="shrink-0">
                    {t("unidentifiedMeta", {
                      count: suggestion.count,
                      date: formatDate(suggestion.lastDate, locale),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
