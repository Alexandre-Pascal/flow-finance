/**
 * @file monthly-analytics.tsx
 * @description Comparaison mensuelle revenus / dépenses avec graphique et tableau.
 */

"use client";

import { ArrowDownLeft, ArrowUpRight, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  computeMonthDelta,
  sliceMonthlyOverview,
  sumMonthlyOverview,
  type MonthlyOverview,
  type MonthlyPeriod,
} from "@/lib/finance/aggregates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MonthlyAnalyticsProps {
  data: MonthlyOverview[];
  locale: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: unknown;
  label?: string | number;
  locale: string;
  incomeLabel: string;
  expensesLabel: string;
  netLabel: string;
}

function getPayloadValue(payload: unknown, key: string): number {
  if (!Array.isArray(payload)) {
    return 0;
  }

  const item = payload.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "name" in entry &&
      String((entry as { name?: unknown }).name) === key,
  ) as { value?: unknown } | undefined;

  const value = item?.value;
  return typeof value === "number" ? value : Number(value ?? 0);
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  incomeLabel,
  expensesLabel,
  netLabel,
}: ChartTooltipProps) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const income = getPayloadValue(payload, "income");
  const expenses = getPayloadValue(payload, "expenses");
  const net = getPayloadValue(payload, "net");

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-2 font-medium text-foreground">{String(label)}</p>
      <div className="space-y-1 text-muted-foreground">
        <p className="flex items-center justify-between gap-6">
          <span>{incomeLabel}</span>
          <span className="font-medium text-[var(--chart-2)]">
            {formatCurrency(income, locale)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-6">
          <span>{expensesLabel}</span>
          <span className="font-medium text-destructive">
            {formatCurrency(expenses, locale)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-6 border-t border-border pt-1">
          <span>{netLabel}</span>
          <span
            className={cn(
              "font-medium",
              net >= 0 ? "text-[var(--chart-2)]" : "text-destructive",
            )}
          >
            {formatCurrency(net, locale)}
          </span>
        </p>
      </div>
    </div>
  );
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

export function MonthlyAnalytics({ data, locale }: MonthlyAnalyticsProps) {
  const t = useTranslations("analytics");
  const [period, setPeriod] = useState<MonthlyPeriod>(12);

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

  if (data.length === 0) {
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={String(period)}
          onValueChange={(value) => setPeriod(value === "all" ? "all" : (Number(value) as MonthlyPeriod))}
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
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={filtered}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)
                  }
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload}
                      label={label}
                      locale={locale}
                      incomeLabel={t("income")}
                      expensesLabel={t("expenses")}
                      netLabel={t("net")}
                    />
                  )}
                />
                <Legend wrapperStyle={{ display: "none" }} />
                <Bar
                  dataKey="income"
                  name="income"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="expenses"
                  name="expenses"
                  fill="var(--destructive)"
                  fillOpacity={0.85}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="net"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
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
    </div>
  );
}
