/**
 * @file subscriptions-analytics-panel.tsx
 * @description Vue mensuelle des abonnements identifiés.
 */

"use client";

import { Repeat } from "lucide-react";
import { useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  sliceMonthlySubscriptionOverview,
  type MonthlySubscriptionRow,
} from "@/lib/finance/recurring-payments";
import { formatCurrency } from "@/lib/format";
import type { RecurringPayment } from "@/types/database";

interface SubscriptionsAnalyticsPanelProps {
  data: MonthlySubscriptionRow[];
  subscriptions: RecurringPayment[];
  locale: string;
  period: MonthlyPeriod;
}

export function SubscriptionsAnalyticsPanel({
  data,
  subscriptions,
  locale,
  period,
}: SubscriptionsAnalyticsPanelProps) {
  const t = useTranslations("analytics");

  const filtered = useMemo(
    () => sliceMonthlySubscriptionOverview(data, period, locale),
    [data, period, locale],
  );

  const currentMonth = filtered.at(-1);
  const periodTotal = useMemo(
    () =>
      Math.round(filtered.reduce((sum, row) => sum + row.total, 0) * 100) / 100,
    [filtered],
  );
  const monthlyEstimate = useMemo(
    () =>
      subscriptions.reduce((sum, item) => sum + item.amount, 0),
    [subscriptions],
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
              {formatCurrency(monthlyEstimate, locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("subscriptionsCount", { count: subscriptions.length })}
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
                <Bar dataKey="total" fill="var(--destructive)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("subscriptionsTableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("subscriptionsService")}</TableHead>
                <TableHead className="text-right">{t("subscriptionsMonthlyAmount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-medium">{subscription.name}</TableCell>
                  <TableCell className="text-right text-destructive">
                    {formatCurrency(subscription.amount, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {[...filtered].reverse().map((row) =>
            row.items.length > 0 ? (
              <div key={row.monthKey} className="space-y-2">
                <p className="text-sm font-medium text-foreground">{row.monthFull}</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {row.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span>{item.name}</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(item.amount, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </CardContent>
      </Card>
    </div>
  );
}
