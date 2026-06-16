/**
 * @file subscriptions-analytics-panel.tsx
 * @description Vue mensuelle des abonnements identifiés.
 */

"use client";

import { Repeat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  listActiveSubscriptions,
  sliceMonthlySubscriptionOverview,
  type MonthlySubscriptionRow,
} from "@/lib/finance/recurring-payments";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecurringPayment, TransactionWithAccount } from "@/types/database";

interface SubscriptionsAnalyticsPanelProps {
  data: MonthlySubscriptionRow[];
  subscriptions: RecurringPayment[];
  transactions: TransactionWithAccount[];
  locale: string;
  period: MonthlyPeriod;
}

export function SubscriptionsAnalyticsPanel({
  data,
  subscriptions,
  transactions,
  locale,
  period,
}: SubscriptionsAnalyticsPanelProps) {
  const t = useTranslations("analytics");

  const filtered = useMemo(
    () => sliceMonthlySubscriptionOverview(data, period, locale),
    [data, period, locale],
  );

  const currentMonthKey = filtered.at(-1)?.monthKey ?? "";
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);

  useEffect(() => {
    setSelectedMonthKey(currentMonthKey);
  }, [currentMonthKey, period]);

  const selectedMonth = useMemo(
    () => filtered.find((row) => row.monthKey === selectedMonthKey),
    [filtered, selectedMonthKey],
  );
  const monthsWithSubscriptions = useMemo(
    () => [...filtered].filter((row) => row.total > 0).reverse(),
    [filtered],
  );

  const activeSubscriptions = useMemo(
    () => listActiveSubscriptions(transactions, subscriptions, locale),
    [transactions, subscriptions, locale],
  );

  const currentMonth = filtered.at(-1);
  const periodTotal = useMemo(
    () =>
      Math.round(filtered.reduce((sum, row) => sum + row.total, 0) * 100) / 100,
    [filtered],
  );
  const activeMonthlyTotal = useMemo(
    () =>
      Math.round(
        activeSubscriptions.reduce((sum, item) => sum + item.monthlyAmount, 0) * 100,
      ) / 100,
    [activeSubscriptions],
  );

  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 py-10 text-center">
          <Repeat className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("subscriptionsEmpty")}</p>
          <p className="text-xs text-muted-foreground">{t("subscriptionsEmptyHint")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("subscriptionsThisMonth")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatCurrency(currentMonth?.total ?? 0, locale)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("subscriptionsPeriodTotal")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatCurrency(periodTotal, locale)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("subscriptionsMonthlyEstimate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight text-destructive">
              {formatCurrency(activeMonthlyTotal, locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("subscriptionsCount", { count: activeSubscriptions.length })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("subscriptionsChartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 min-h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filtered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
                      notation: "compact",
                      maximumFractionDigits: 0,
                    }).format(value)
                  }
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  formatter={(value) => formatCurrency(Number(value), locale)}
                />
                <Bar
                  dataKey="total"
                  fill="var(--destructive)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  className="cursor-pointer"
                  onClick={(bar) => {
                    const row = bar?.payload as MonthlySubscriptionRow | undefined;
                    if (row?.monthKey) {
                      setSelectedMonthKey(row.monthKey);
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("subscriptionsTableTitle")}</CardTitle>
          <CardDescription>{t("subscriptionsTableHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {activeSubscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("subscriptionsActiveEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("subscriptionsService")}</TableHead>
                  <TableHead className="text-right">{t("subscriptionsMonthlyAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSubscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell className="font-medium">
                      <div>{subscription.name}</div>
                      {subscription.cadence === "yearly" ? (
                        <p className="text-xs font-normal text-muted-foreground">
                          {t("subscriptionsYearlyBilling", {
                            amount: formatCurrency(subscription.billingAmount, locale),
                          })}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatCurrency(subscription.monthlyAmount, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {t("subscriptionsMonthTableTitle")}
          </CardTitle>
          <CardDescription>{t("subscriptionsMonthTableHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {monthsWithSubscriptions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("month")}</TableHead>
                  <TableHead className="text-right">{t("subscriptionsMonthAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthsWithSubscriptions.map((row) => (
                  <TableRow
                    key={row.monthKey}
                    className={cn(
                      "cursor-pointer",
                      selectedMonthKey === row.monthKey && "bg-muted/60",
                    )}
                    onClick={() => setSelectedMonthKey(row.monthKey)}
                  >
                    <TableCell className="font-medium">{row.monthFull}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {formatCurrency(row.total, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t("subscriptionsMonthEmpty")}</p>
          )}

          {selectedMonth ? (
            <div className="rounded-lg border border-border bg-muted/30">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {t("monthDetailTitle", { month: selectedMonth.monthFull })}
                </p>
              </div>
              {selectedMonth.items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("subscriptionsService")}</TableHead>
                      <TableHead className="text-right">{t("subscriptionsMonthAmount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMonth.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right text-destructive">
                          {formatCurrency(item.amount, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("monthDetailEmpty")}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
