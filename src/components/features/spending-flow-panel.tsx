/**
 * @file spending-flow-panel.tsx
 * @description Carte « répartition du budget » : période, agrégation des
 * données déjà calculées ailleurs (catégories, abonnements, versements
 * d'épargne, rentrées suivies) et rendu du Sankey.
 */

"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import type { MonthlyOverview } from "@/lib/finance/aggregates";
import {
  SUBSCRIPTIONS_KEY,
  type CategoryBreakdown,
} from "@/lib/finance/category-analytics";
import type { ContributionFlowOverview } from "@/lib/finance/contribution-flow";
import type { MonthlySubscriptionRow } from "@/lib/finance/recurring-payments";
import {
  buildSpendingFlow,
  SAVINGS_COLOR,
  SAVINGS_KEY,
  type FlowEntry,
} from "@/lib/finance/spending-flow";
import type { MonthlyTransferOverview } from "@/lib/finance/tracked-transfers";
import { formatCurrency } from "@/lib/format";

const SpendingFlowGraph = dynamic(
  () => import("@/components/features/spending-flow-graph"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[420px] w-full" />,
  },
);

/** Une source de rentrée suivie, avec sa série mensuelle déjà agrégée. */
export interface SpendingFlowIncomeSeries {
  key: string;
  name: string;
  color: string;
  data: MonthlyTransferOverview[];
}

interface SpendingFlowPanelProps {
  breakdown: CategoryBreakdown;
  monthlyOverview: MonthlyOverview[];
  incomeSeries: SpendingFlowIncomeSeries[];
  subscriptionRows: MonthlySubscriptionRow[];
  contribution: ContributionFlowOverview;
  locale: string;
}

const PERIODS: MonthlyPeriod[] = [1, 3, 6, 12];
const OTHER_INCOME_COLOR = "#64748B";
/** En dessous, les couloirs de libellés ne tiennent plus : on défile. */
const MIN_CHART_WIDTH = 880;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function SpendingFlowPanel({
  breakdown,
  monthlyOverview,
  incomeSeries,
  subscriptionRows,
  contribution,
  locale,
}: SpendingFlowPanelProps) {
  const t = useTranslations("spendingFlow");
  const [period, setPeriod] = useState<MonthlyPeriod>(1);
  // recharts ne transmet pas la largeur du conteneur aux formes
  // personnalisées : on la mesure ici et on la passe au graphique.
  const frameRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setChartWidth(entry.contentRect.width);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const monthKeys = useMemo(() => {
    const months = monthlyOverview.length
      ? monthlyOverview.map((row) => row.monthKey)
      : breakdown.months.map((row) => row.monthKey);
    return new Set(period === "all" ? months : months.slice(-period));
  }, [breakdown.months, monthlyOverview, period]);

  const flow = useMemo(() => {
    const income = round(
      monthlyOverview
        .filter((row) => monthKeys.has(row.monthKey))
        .reduce((total, row) => total + row.income, 0),
    );

    const incomes: FlowEntry[] = incomeSeries.map((series) => ({
      key: series.key,
      name: series.name,
      color: series.color,
      amount: round(
        series.data
          .filter((row) => monthKeys.has(row.monthKey))
          .reduce((total, row) => total + Math.abs(row.amount), 0),
      ),
    }));

    // Tout ce que les libellés suivis n'expliquent pas reste une entrée à part.
    const tracked = round(
      incomes.reduce((total, entry) => total + entry.amount, 0),
    );
    if (income - tracked > 0.01) {
      incomes.push({
        key: "__other_income__",
        name: t("otherIncome"),
        color: OTHER_INCOME_COLOR,
        amount: round(income - tracked),
      });
    }

    const categories: FlowEntry[] = Object.entries(breakdown.meta).map(
      ([key, meta]) => ({
        key,
        name: meta.name,
        color: meta.color,
        amount: round(
          breakdown.months
            .filter((row) => monthKeys.has(row.monthKey))
            .reduce((total, row) => total + (row.values[key] ?? 0), 0),
        ),
      }),
    );

    const subscriptionTotals = new Map<string, FlowEntry>();
    for (const row of subscriptionRows) {
      if (!monthKeys.has(row.monthKey)) continue;
      for (const item of row.items) {
        const existing = subscriptionTotals.get(item.id);
        subscriptionTotals.set(item.id, {
          key: item.id,
          name: item.name,
          color: breakdown.meta[SUBSCRIPTIONS_KEY]?.color ?? SAVINGS_COLOR,
          amount: round((existing?.amount ?? 0) + item.amount),
        });
      }
    }

    const savingsEntries: FlowEntry[] = contribution.envelopes
      .map((envelope) => ({
        key: envelope.id,
        name: envelope.name,
        color: envelope.color,
        amount: round(
          contribution.months
            .filter((row) => monthKeys.has(row.monthKey))
            .reduce((total, row) => total + (row.byEnvelope[envelope.id] ?? 0), 0),
        ),
      }))
      .filter((entry) => entry.amount > 0);

    const savingsTotal = round(
      savingsEntries.reduce((total, entry) => total + entry.amount, 0),
    );
    if (savingsTotal > 0) {
      categories.push({
        key: SAVINGS_KEY,
        name: t("savings"),
        color: SAVINGS_COLOR,
        amount: savingsTotal,
      });
    }

    return buildSpendingFlow({
      incomes,
      categories,
      details: {
        [SUBSCRIPTIONS_KEY]: [...subscriptionTotals.values()],
        [SAVINGS_KEY]: savingsEntries,
      },
      labels: {
        budget: t("budget"),
        rest: t("rest"),
        other: t("other"),
        otherCategories: t("other"),
      },
      formatOtherCategories: (count) => t("otherCategories", { count }),
      formatOtherLines: (count) => t("otherLines", { count }),
    });
  }, [
    breakdown,
    contribution,
    incomeSeries,
    monthKeys,
    monthlyOverview,
    subscriptionRows,
    t,
  ]);

  // La hauteur suit la colonne la plus chargée : en dessous d'une quarantaine
  // de pixels par nœud, les libellés se chevauchent. Les nœuds terminaux sont
  // tous dessinés dans la dernière colonne, c'est elle qui se remplit.
  const height = useMemo(() => {
    const maxDepth = flow.nodes.reduce(
      (deepest, node) => Math.max(deepest, node.depth),
      0,
    );
    const perColumn = new Map<number, number>();
    for (const node of flow.nodes) {
      const column = node.isLeaf ? maxDepth : node.depth;
      perColumn.set(column, (perColumn.get(column) ?? 0) + 1);
    }
    return Math.max(360, Math.max(...perColumn.values(), 1) * 52);
  }, [flow.nodes]);

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Tabs
          value={String(period)}
          onValueChange={(value) => setPeriod(Number(value) as MonthlyPeriod)}
        >
          <TabsList>
            {PERIODS.map((value) => (
              <TabsTrigger
                key={value}
                value={String(value)}
                className="cursor-pointer px-3"
              >
                {t("period", { count: value as number })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-3">
        {flow.hasData ? (
          <>
            <div ref={frameRef} className="w-full overflow-x-auto">
              {chartWidth > 0 ? (
                <SpendingFlowGraph
                  flow={flow}
                  locale={locale}
                  width={Math.max(MIN_CHART_WIDTH, chartWidth)}
                  height={height}
                />
              ) : (
                <Skeleton style={{ height }} className="w-full" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {flow.deficit > 0
                ? t("summaryDeficit", {
                    income: formatCurrency(flow.income, locale),
                    allocated: formatCurrency(flow.allocated, locale),
                    deficit: formatCurrency(flow.deficit, locale),
                  })
                : t("summary", {
                    income: formatCurrency(flow.income, locale),
                    allocated: formatCurrency(flow.allocated, locale),
                    rest: formatCurrency(flow.rest, locale),
                  })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}
