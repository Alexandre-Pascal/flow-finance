/**
 * @file mother-transfers-panel.tsx
 * @description Suivi mensuel des virements reçus de Sophie Pascal.
 */

"use client";

import { Gift } from "lucide-react";
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
  sliceMonthlyTransferOverview,
  sumMonthlyTransferOverview,
  type MonthlyTransferOverview,
} from "@/lib/finance/tracked-transfers";
import { formatCurrency } from "@/lib/format";

interface MotherTransfersPanelProps {
  data: MonthlyTransferOverview[];
  locale: string;
  period: MonthlyPeriod;
}

function TransferTooltip({
  active,
  payload,
  label,
  locale,
}: {
  active?: boolean;
  payload?: unknown;
  label?: string | number;
  locale: string;
}) {
  const t = useTranslations("analytics");

  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const item = payload[0] as { value?: number };
  const amount = typeof item.value === "number" ? item.value : Number(item.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{String(label)}</p>
      <p className="text-muted-foreground">
        {t("motherTransferAmount")}:{" "}
        <span className="font-medium text-accent">{formatCurrency(amount, locale)}</span>
      </p>
    </div>
  );
}

export function MotherTransfersPanel({
  data,
  locale,
  period,
}: MotherTransfersPanelProps) {
  const t = useTranslations("analytics");

  const filtered = useMemo(
    () => sliceMonthlyTransferOverview(data, period, locale),
    [data, period, locale],
  );

  const totals = useMemo(() => sumMonthlyTransferOverview(filtered), [filtered]);
  const currentMonth = filtered.at(-1);
  const monthsWithTransfers = useMemo(
    () => [...filtered].filter((row) => row.amount > 0).reverse(),
    [filtered],
  );

  const averagePerActiveMonth =
    totals.monthsWithTransfer > 0
      ? Math.round((totals.amount / totals.monthsWithTransfer) * 100) / 100
      : 0;

  if (data.length === 0) {
    return (
      <Card className="border-accent/30 bg-gradient-to-br from-accent/5 via-card to-card">
        <CardHeader className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Gift className="size-5" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-base font-medium">
              {t("motherTransferTitle")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("motherTransferSubtitle")}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            {t("motherTransferNoneFound")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-accent/30 bg-gradient-to-br from-accent/5 via-card to-card">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Gift className="size-5" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-base font-medium">
              {t("motherTransferTitle")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("motherTransferSubtitle")}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card/80 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("motherTransferThisMonth")}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-accent">
              {formatCurrency(currentMonth?.amount ?? 0, locale)}
            </p>
            {currentMonth && currentMonth.transferCount > 1 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("motherTransferCount", { count: currentMonth.transferCount })}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-card/80 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("motherTransferPeriodTotal")}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {formatCurrency(totals.amount, locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("motherTransferOperations", { count: totals.transferCount })}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card/80 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("motherTransferAverage")}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {formatCurrency(averagePerActiveMonth, locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("motherTransferActiveMonths", {
                count: totals.monthsWithTransfer,
              })}
            </p>
          </div>
        </div>

        <div className="h-48 min-h-48 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filtered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                    maximumFractionDigits: 0,
                  }).format(value)
                }
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload, label }) => (
                  <TransferTooltip
                    active={active}
                    payload={payload}
                    label={label}
                    locale={locale}
                  />
                )}
              />
              <Bar
                dataKey="amount"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {monthsWithTransfers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("month")}</TableHead>
                <TableHead className="text-right">{t("motherTransferAmount")}</TableHead>
                <TableHead className="text-right">{t("motherTransferOperationsShort")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthsWithTransfers.map((row) => (
                <TableRow key={row.monthKey}>
                  <TableCell className="font-medium">{row.monthFull}</TableCell>
                  <TableCell className="text-right font-medium text-accent">
                    {formatCurrency(row.amount, locale)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.transferCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {t("motherTransferNoneInPeriod")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
