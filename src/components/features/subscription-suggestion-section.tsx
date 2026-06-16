/**
 * @file subscription-suggestion-section.tsx
 * @description Section PayPal ou prélèvements généraux : suggestions, ajout, masquage.
 */

"use client";

import { EyeOff, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  createRecurringPaymentAction,
  dismissRecurringSuggestionAction,
} from "@/app/actions/recurring-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  clusterSuggestionKey,
  type RecurringClusterSuggestion,
} from "@/lib/finance/recurring-payments";

interface SubscriptionSuggestionSectionProps {
  sectionId: string;
  title: string;
  description: string;
  pickClusterHint: string;
  noSuggestionsLabel: string;
  suggestions: RecurringClusterSuggestion[];
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
  onError: (message: string | null) => void;
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

function suggestionSummary(
  suggestion: RecurringClusterSuggestion,
  t: ReturnType<typeof useTranslations<"subscriptions">>,
  locale: string,
): string {
  if (suggestion.source === "paypal") {
    return t("unidentifiedClusterPaypal", {
      amount: formatCurrency(-suggestion.amount, locale),
      day: suggestion.billingDay,
    });
  }

  if (suggestion.cadence === "yearly") {
    return t("unidentifiedClusterYearly", {
      amount: formatCurrency(-suggestion.amount, locale),
      preview: suggestion.descriptionPreview,
      month: suggestion.billingMonth ?? 1,
      day: suggestion.billingDay,
    });
  }

  return t("unidentifiedClusterMonthly", {
    amount: formatCurrency(-suggestion.amount, locale),
    preview: suggestion.descriptionPreview,
    day: suggestion.billingDay,
  });
}

function appendSuggestionFields(formData: FormData, suggestion: RecurringClusterSuggestion) {
  formData.set("amount", String(suggestion.amount));
  formData.set("billing_day", String(suggestion.billingDay));
  formData.set("billing_month", suggestion.billingMonth ? String(suggestion.billingMonth) : "");
  formData.set("cadence", suggestion.cadence);
  formData.set("description_pattern", suggestion.descriptionPattern);
  formData.set("description_preview", suggestion.descriptionPreview);
  formData.set("source", suggestion.source);
  formData.set("last_date", suggestion.lastDate);
  formData.set("count", String(suggestion.count));
}

export function SubscriptionSuggestionSection({
  sectionId,
  title,
  description,
  pickClusterHint,
  noSuggestionsLabel,
  suggestions,
  locale,
  isDemo,
  schemaReady,
  onError,
}: SubscriptionSuggestionSectionProps) {
  const t = useTranslations("subscriptions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedClusterKey, setSelectedClusterKey] = useState(
    suggestions[0] ? clusterSuggestionKey(suggestions[0]) : "",
  );
  const [name, setName] = useState("");

  const selectedSuggestion = suggestions.find(
    (suggestion) => clusterSuggestionKey(suggestion) === selectedClusterKey,
  );

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);

    if (!selectedSuggestion) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    appendSuggestionFields(formData, selectedSuggestion);

    startTransition(async () => {
      const result = await createRecurringPaymentAction(formData);
      if (result.error === "demo") {
        onError(t("demoError"));
        return;
      }
      if (result.error === "schema") {
        onError(t("schemaError"));
        return;
      }
      if (result.error === "inactive") {
        onError(t("inactiveError"));
        return;
      }
      if (result.error) {
        onError(t("saveError"));
        return;
      }
      if ("warning" in result && result.warning === "rematch") {
        onError(t("rematchWarning"));
        router.refresh();
        return;
      }
      setName("");
      onError(null);
      router.refresh();
    });
  }

  function handleDismiss(suggestion: RecurringClusterSuggestion) {
    onError(null);
    const formData = new FormData();
    appendSuggestionFields(formData, suggestion);

    startTransition(async () => {
      const result = await dismissRecurringSuggestionAction(formData);
      if (result.error === "schema") {
        onError(t("schemaError"));
        return;
      }
      if (result.error) {
        onError(t("saveError"));
        return;
      }
      if (selectedClusterKey === clusterSuggestionKey(suggestion)) {
        setSelectedClusterKey("");
      }
      router.refresh();
    });
  }

  if (isDemo || !schemaReady) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {suggestions.length > 0 ? (
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("pickCluster")}</Label>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => {
                const key = clusterSuggestionKey(suggestion);
                return (
                  <div key={key} className="flex max-w-full items-stretch gap-1">
                    <Button
                      type="button"
                      variant={selectedClusterKey === key ? "default" : "outline"}
                      className="h-auto min-w-0 flex-1 cursor-pointer whitespace-normal py-2 text-left"
                      onClick={() => setSelectedClusterKey(key)}
                    >
                      {suggestionLabel(suggestion, t, locale)}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 cursor-pointer"
                      disabled={isPending}
                      onClick={() => handleDismiss(suggestion)}
                      aria-label={t("dismissSuggestion")}
                      title={t("dismissSuggestion")}
                    >
                      <EyeOff className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{pickClusterHint}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`subscription-name-${sectionId}`}>{t("nameLabel")}</Label>
            <Input
              id={`subscription-name-${sectionId}`}
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
            disabled={isPending || !selectedSuggestion || !name.trim()}
          >
            <Plus className="size-4" aria-hidden />
            {t("addButton")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{noSuggestionsLabel}</p>
      )}

      {suggestions.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">{t("unidentifiedTitle")}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {suggestions.map((suggestion) => (
              <li
                key={clusterSuggestionKey(suggestion)}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {suggestionSummary(suggestion, t, locale)}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span>
                    {t("unidentifiedMeta", {
                      count: suggestion.count,
                      date: formatDate(suggestion.lastDate, locale),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer"
                    disabled={isPending}
                    onClick={() => handleDismiss(suggestion)}
                    aria-label={t("dismissSuggestion")}
                    title={t("dismissSuggestion")}
                  >
                    <EyeOff className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
