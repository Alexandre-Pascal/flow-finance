/**
 * @file subscriptions-manager.tsx
 * @description Gestion des abonnements et prélèvements récurrents.
 */

"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteRecurringPaymentAction } from "@/app/actions/recurring-payments";
import { SubscriptionSuggestionSection } from "@/components/features/subscription-suggestion-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { RecurringClusterSuggestion } from "@/lib/finance/recurring-payments";
import type { RecurringPayment } from "@/types/database";

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
  paypalSuggestions,
  generalSuggestions,
  locale,
  isDemo,
  schemaReady,
}: SubscriptionsManagerProps) {
  const t = useTranslations("subscriptions");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
