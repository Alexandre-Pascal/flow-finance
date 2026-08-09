/**
 * @file contribution-flow-panel.tsx
 * @description Section « Ce que j'épargne » : KPI du mois, évolution et détail
 * par enveloppe (livrets + PEA).
 */

"use client";

import { ArrowDownRight, ArrowUpRight, PiggyBank } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildContributionFlow,
  sliceContributionFlow,
  sumContributionsByEnvelope,
} from "@/lib/finance/contribution-flow";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import { computeMonthDelta } from "@/lib/finance/aggregates";
import { formatCurrency } from "@/lib/format";
import type { SavingsAccount, TransactionWithAccount } from "@/types/database";
import { cn } from "@/lib/utils";

const ContributionFlowChart = dynamic(
  () => import("@/components/features/contribution-flow-chart"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

interface ContributionFlowPanelProps {
  transactions: TransactionWithAccount[];
  savingsAccounts: SavingsAccount[];
  locale: string;
  includePea?: boolean;
}

export function ContributionFlowPanel({
  transactions,
  savingsAccounts,
  locale,
  includePea = true,
}: ContributionFlowPanelProps) {
  const t = useTranslations("savings");
  const [period, setPeriod] = useState<MonthlyPeriod>(12);

  const overview = useMemo(
    () =>
      sliceContributionFlow(
        buildContributionFlow(transactions, savingsAccounts, locale, {
          includePea,
        }),
        period,
        locale,
      ),
    [transactions, savingsAccounts, locale, includePea, period],
  );

  const envelopeTotals = useMemo(
    () => sumContributionsByEnvelope(overview.months, overview.envelopes),
    [overview.months, overview.envelopes],
  );

  const currentNet = overview.current?.net ?? 0;
  const previousNet = overview.previous?.net ?? 0;
  const delta = computeMonthDelta(currentNet, previousNet);

  if (!overview.hasData && savingsAccounts.length === 0 && !includePea) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <PiggyBank className="size-4 text-muted-foreground" aria-hidden />
          {t("contributionTitle")}
        </div>
        <Tabs
          value={String(period)}
          onValueChange={(value) =>
            setPeriod(value === "all" ? "all" : (Number(value) as MonthlyPeriod))
          }
        >
          <TabsList>
            <TabsTrigger value="3" className="cursor-pointer">
              {t("period3")}
            </TabsTrigger>
            <TabsTrigger value="6" className="cursor-pointer">
              {t("period6")}
            </TabsTrigger>
            <TabsTrigger value="12" className="cursor-pointer">
              {t("period12")}
            </TabsTrigger>
            <TabsTrigger value="all" className="cursor-pointer">
              {t("periodAll")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <p className="text-sm text-muted-foreground">{t("contributionSubtitle")}</p>

      {!overview.hasData ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("contributionEmpty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardHeader className="pb-2">
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi
                  label={t("contributionThisMonth")}
                  value={formatCurrency(currentNet, locale)}
                  hint={
                    delta.percent == null
                      ? t("contributionVsPreviousNone")
                      : delta.value >= 0
                        ? t("contributionVsPreviousUp", {
                            percent: Math.abs(delta.percent),
                          })
                        : t("contributionVsPreviousDown", {
                            percent: Math.abs(delta.percent),
                          })
                  }
                  positive={currentNet >= 0}
                  delta={delta.value}
                />
                <Kpi
                  label={t("contributionAverage")}
                  value={formatCurrency(overview.averageNet, locale)}
                  hint={t("contributionAverageHint")}
                />
                <Kpi
                  label={t("contributionPeriodTotal")}
                  value={formatCurrency(overview.periodNet, locale)}
                  hint={t("contributionPeriodHint")}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ContributionFlowChart
                  months={overview.months}
                  envelopes={overview.envelopes}
                  locale={locale}
                  netLabel={t("contributionNet")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("contributionByEnvelope")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {envelopeTotals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("contributionEmpty")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {envelopeTotals.map((envelope) => {
                    const share =
                      overview.periodNet > 0
                        ? Math.round((envelope.net / overview.periodNet) * 100)
                        : 0;
                    return (
                      <li key={envelope.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: envelope.color }}
                              aria-hidden
                            />
                            <span className="truncate font-medium">
                              {envelope.name}
                            </span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(envelope.net, locale)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-[width]"
                            style={{
                              width: `${Math.max(0, Math.min(100, share))}%`,
                              backgroundColor: envelope.color,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  positive,
  delta,
}: {
  label: string;
  value: string;
  hint: string;
  positive?: boolean;
  delta?: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums tracking-tight",
          positive === undefined
            ? "text-foreground"
            : positive
              ? "text-[var(--chart-2)]"
              : "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        {delta != null && delta !== 0 ? (
          delta > 0 ? (
            <ArrowUpRight className="size-3 text-[var(--chart-2)]" aria-hidden />
          ) : (
            <ArrowDownRight className="size-3 text-destructive" aria-hidden />
          )
        ) : null}
        {hint}
      </p>
    </div>
  );
}
