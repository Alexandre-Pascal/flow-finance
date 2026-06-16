/**
 * @file subscriptions-manager.tsx
 * @description Gestion des abonnements (règles par montant PayPal).
 */

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
  type PayPalClusterSuggestion,
} from "@/lib/finance/recurring-payments";
import type { RecurringPayment } from "@/types/database";

interface SubscriptionsManagerProps {
  subscriptions: RecurringPayment[];
  suggestions: PayPalClusterSuggestion[];
  locale: string;
  isDemo: boolean;
}

export function SubscriptionsManager({
  subscriptions,
  suggestions,
  locale,
  isDemo,
}: SubscriptionsManagerProps) {
  const t = useTranslations("subscriptions");
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
      if (result.error) {
        setError(t("saveError"));
        return;
      }
      setName("");
    });
  }

  function handleDelete(id: string) {
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await deleteRecurringPaymentAction(formData);
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

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!isDemo ? (
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
                        className="cursor-pointer"
                        onClick={() => setSelectedClusterKey(key)}
                      >
                        {t("clusterLabel", {
                          amount: formatCurrency(-suggestion.amount, locale),
                          day: suggestion.billingDay,
                          count: suggestion.count,
                        })}
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
            <input type="hidden" name="description_pattern" value="PAYPAL" />

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
                      {subscription.billing_day
                        ? t("subscriptionMetaWithDay", {
                            amount: formatCurrency(-subscription.amount, locale),
                            day: subscription.billing_day,
                          })
                        : t("subscriptionMeta", {
                            amount: formatCurrency(-subscription.amount, locale),
                          })}
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
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                >
                  <span>
                    {t("unidentifiedCluster", {
                      amount: formatCurrency(-suggestion.amount, locale),
                      day: suggestion.billingDay,
                    })}
                  </span>
                  <span>
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
