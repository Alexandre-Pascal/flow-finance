/**
 * @file monthly-analytics.tsx
 * @description Comparaison mensuelle revenus / dépenses avec graphique et tableau.
 */

"use client";

import { ArrowDownLeft, ArrowUpRight, Scale, TrendingDown, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  computeMonthDelta,
  sliceMonthlyOverview,
  sumMonthlyOverview,
  type MonthlyOverview,
  type MonthlyPeriod,
} from "@/lib/finance/aggregates";
import { type MonthlyTransferOverview } from "@/lib/finance/tracked-transfers";
import type { MonthlySubscriptionRow } from "@/lib/finance/recurring-payments";
import type { RecurringPayment, TransactionWithAccount } from "@/types/database";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MonthlyAnalyticsGraph = dynamic(
  () => import("@/components/features/monthly-analytics-graph"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

// Les trois panneaux ci-dessous vivent dans des onglets inactifs au chargement.
// Radix les démonte, mais leur code restait dans le bundle initial : on ne le
// télécharge donc qu'au moment où l'utilisateur ouvre l'onglet.
const MotherTransfersPanel = dynamic(
  () =>
    import("@/components/features/mother-transfers-panel").then(
      (mod) => mod.MotherTransfersPanel,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

const PayrollTransfersPanel = dynamic(
  () =>
    import("@/components/features/payroll-transfers-panel").then(
      (mod) => mod.PayrollTransfersPanel,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

const SubscriptionsAnalyticsPanel = dynamic(
  () =>
    import("@/components/features/subscriptions-analytics-panel").then(
      (mod) => mod.SubscriptionsAnalyticsPanel,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

const OutgoingTransfersPanel = dynamic(
  () =>
    import("@/components/features/outgoing-transfers-panel").then(
      (mod) => mod.OutgoingTransfersPanel,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

interface OutgoingPersonSeries {
  person: {
    id: string;
    label: string;
    keyword: string;
  };
  data: MonthlyTransferOverview[];
}

interface MonthlyAnalyticsProps {
  data: MonthlyOverview[];
  motherTransferData: MonthlyTransferOverview[];
  payrollTransferData: MonthlyTransferOverview[];
  outgoingTransferSeries?: OutgoingPersonSeries[];
  subscriptionData: MonthlySubscriptionRow[];
  subscriptions: RecurringPayment[];
  transactions: TransactionWithAccount[];
  locale: string;
  showTrackedPerson?: boolean;
  showPayroll?: boolean;
  showTrackedOutgoing?: boolean;
  trackedPersonKeyword?: string | null;
  trackedPersonLabel?: string | null;
  payrollKeyword?: string | null;
  payrollBudgetShiftMonths?: number;
}

function DeltaBadge({
  delta,
  locale,
  invert = false,
}: {
  delta: { value: number; percent: number | null };
  locale: string;
  invert?: boolean;
}) {
  const t = useTranslations("analytics");
  const isPositive = invert ? delta.value < 0 : delta.value > 0;
  const isNegative = invert ? delta.value > 0 : delta.value < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Scale;

  return (
    <Badge
      variant="outline"
      className={cn(
        "mt-2 gap-1 font-normal",
        isPositive && "border-[var(--chart-2)]/30 text-[var(--chart-2)]",
        isNegative && "border-destructive/30 text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {delta.percent !== null
        ? t("vsPreviousMonth", { percent: Math.abs(delta.percent) })
        : formatCurrency(Math.abs(delta.value), locale)}
    </Badge>
  );
}

type AnalyticsView =
  | "overview"
  | "mother"
  | "payroll"
  | "outgoing"
  | "subscriptions";

export function MonthlyAnalytics({
  data,
  motherTransferData,
  payrollTransferData,
  outgoingTransferSeries = [],
  subscriptionData,
  subscriptions,
  transactions,
  locale,
  showTrackedPerson = false,
  showPayroll = false,
  showTrackedOutgoing = false,
  trackedPersonKeyword = null,
  trackedPersonLabel = null,
  payrollKeyword = null,
  payrollBudgetShiftMonths = 1,
}: MonthlyAnalyticsProps) {
  const t = useTranslations("analytics");
  const [view, setView] = useState<AnalyticsView>("overview");
  const [period, setPeriod] = useState<MonthlyPeriod>(6);

  const filtered = useMemo(
    () => sliceMonthlyOverview(data, period, locale),
    [data, period, locale],
  );

  const totals = useMemo(() => sumMonthlyOverview(filtered), [filtered]);

  const currentMonth = filtered.at(-1);
  const previousMonth = filtered.at(-2);

  const incomeDelta = currentMonth && previousMonth
    ? computeMonthDelta(currentMonth.income, previousMonth.income)
    : null;
  const expensesDelta = currentMonth && previousMonth
    ? computeMonthDelta(currentMonth.expenses, previousMonth.expenses)
    : null;
  const netDelta = currentMonth && previousMonth
    ? computeMonthDelta(currentMonth.net, previousMonth.net)
    : null;

  if (data.length === 0 && motherTransferData.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-48 items-center justify-center py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as AnalyticsView)}
        className="gap-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-auto w-full sm:w-auto">
            <TabsTrigger value="overview" className="cursor-pointer px-4 py-2">
              {t("viewOverview")}
            </TabsTrigger>
            {showTrackedPerson && trackedPersonKeyword ? (
              <TabsTrigger value="mother" className="cursor-pointer px-4 py-2">
                {t("viewMotherTransfers", {
                  label: trackedPersonLabel || trackedPersonKeyword,
                })}
              </TabsTrigger>
            ) : null}
            {showPayroll && payrollKeyword ? (
              <TabsTrigger value="payroll" className="cursor-pointer px-4 py-2">
                {t("viewPayroll")}
              </TabsTrigger>
            ) : null}
            {showTrackedOutgoing && outgoingTransferSeries.length > 0 ? (
              <TabsTrigger value="outgoing" className="cursor-pointer px-4 py-2">
                {t("viewOutgoingTransfers")}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="subscriptions" className="cursor-pointer px-4 py-2">
              {t("viewSubscriptions")}
            </TabsTrigger>
          </TabsList>

          <Tabs
            value={String(period)}
            onValueChange={(value) =>
              setPeriod(value === "all" ? "all" : (Number(value) as MonthlyPeriod))
            }
          >
            <TabsList>
              <TabsTrigger value="6" className="cursor-pointer px-3">
                {t("period6")}
              </TabsTrigger>
              <TabsTrigger value="12" className="cursor-pointer px-3">
                {t("period12")}
              </TabsTrigger>
              <TabsTrigger value="all" className="cursor-pointer px-3">
                {t("periodAll")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-6">
          {data.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-48 items-center justify-center py-10 text-center text-sm text-muted-foreground">
                {t("empty")}
              </CardContent>
            </Card>
          ) : (
            <>
              {currentMonth ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="transition-shadow duration-200 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("currentIncome")}
              </CardTitle>
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--chart-2)]/10 text-[var(--chart-2)]">
                <ArrowUpRight className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">
                {formatCurrency(currentMonth.income, locale)}
              </p>
              {incomeDelta ? <DeltaBadge delta={incomeDelta} locale={locale} /> : null}
            </CardContent>
          </Card>

          <Card className="transition-shadow duration-200 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("currentExpenses")}
              </CardTitle>
              <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <ArrowDownLeft className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">
                {formatCurrency(currentMonth.expenses, locale)}
              </p>
              {expensesDelta ? (
                <DeltaBadge delta={expensesDelta} locale={locale} invert />
              ) : null}
            </CardContent>
          </Card>

          <Card className="transition-shadow duration-200 hover:shadow-md sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("currentNet")}
              </CardTitle>
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg",
                  currentMonth.net >= 0
                    ? "bg-accent/15 text-accent"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                <Scale className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  currentMonth.net >= 0 ? "text-foreground" : "text-destructive",
                )}
              >
                {formatCurrency(currentMonth.net, locale)}
              </p>
              {netDelta ? <DeltaBadge delta={netDelta} locale={locale} /> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

              <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-medium">{t("chartTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("chartSubtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--chart-2)]" aria-hidden />
              {t("income")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-destructive/80" aria-hidden />
              {t("expenses")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-accent" aria-hidden />
              {t("net")}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80 min-h-80 w-full min-w-0">
            <MonthlyAnalyticsGraph
              data={filtered}
              locale={locale}
              incomeLabel={t("income")}
              expensesLabel={t("expenses")}
              netLabel={t("net")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("month")}</TableHead>
                <TableHead className="text-right">{t("income")}</TableHead>
                <TableHead className="text-right">{t("expenses")}</TableHead>
                <TableHead className="text-right">{t("net")}</TableHead>
                <TableHead className="text-right">{t("savingsRate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...filtered].reverse().map((row) => (
                <TableRow key={row.monthKey}>
                  <TableCell className="font-medium">{row.monthFull}</TableCell>
                  <TableCell className="text-right text-[var(--chart-2)]">
                    {formatCurrency(row.income, locale)}
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {formatCurrency(row.expenses, locale)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      row.net >= 0 ? "text-foreground" : "text-destructive",
                    )}
                  >
                    {formatCurrency(row.net, locale)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.savingsRate !== null ? `${row.savingsRate} %` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <span className="font-medium text-foreground">{t("periodTotal")}</span>
            <div className="flex flex-wrap gap-4 text-muted-foreground">
              <span>
                {t("income")}:{" "}
                <span className="font-medium text-[var(--chart-2)]">
                  {formatCurrency(totals.income, locale)}
                </span>
              </span>
              <span>
                {t("expenses")}:{" "}
                <span className="font-medium text-destructive">
                  {formatCurrency(totals.expenses, locale)}
                </span>
              </span>
              <span>
                {t("net")}:{" "}
                <span
                  className={cn(
                    "font-medium",
                    totals.net >= 0 ? "text-foreground" : "text-destructive",
                  )}
                >
                  {formatCurrency(totals.net, locale)}
                </span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
            </>
          )}
        </TabsContent>

        {showTrackedPerson && trackedPersonKeyword ? (
          <TabsContent value="mother" className="mt-0">
            <MotherTransfersPanel
              data={motherTransferData}
              transactions={transactions}
              locale={locale}
              period={period}
              keyword={trackedPersonKeyword}
              label={trackedPersonLabel || trackedPersonKeyword}
            />
          </TabsContent>
        ) : null}

        {showPayroll && payrollKeyword ? (
          <TabsContent value="payroll" className="mt-0">
            <PayrollTransfersPanel
              data={payrollTransferData}
              transactions={transactions}
              locale={locale}
              period={period}
              keyword={payrollKeyword}
              budgetShiftMonths={payrollBudgetShiftMonths}
            />
          </TabsContent>
        ) : null}

        {showTrackedOutgoing && outgoingTransferSeries.length > 0 ? (
          <TabsContent value="outgoing" className="mt-0">
            <OutgoingTransfersPanel
              series={outgoingTransferSeries}
              transactions={transactions}
              locale={locale}
              period={period}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="subscriptions" className="mt-0">
          <SubscriptionsAnalyticsPanel
            data={subscriptionData}
            subscriptions={subscriptions}
            transactions={transactions}
            locale={locale}
            period={period}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
