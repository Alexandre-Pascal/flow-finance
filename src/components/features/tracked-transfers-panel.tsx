/**
 * @file tracked-transfers-panel.tsx
 * @description Panneau analytics pour un type de virement suivi par libellé.
 */

"use client";

import type { LucideIcon } from "lucide-react";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionWithAccount } from "@/types/database";

type TransferTranslationPrefix = "motherTransfer" | "payrollTransfer";

interface TrackedTransfersPanelProps {
  data: MonthlyTransferOverview[];
  transactions: TransactionWithAccount[];
  locale: string;
  period: MonthlyPeriod;
  predicate: (tx: TransactionWithAccount) => boolean;
  translationPrefix: TransferTranslationPrefix;
  icon: LucideIcon;
  accentClassName?: string;
}

function TransferTooltip({
  active,
  payload,
  label,
  locale,
  amountLabel,
}: {
  active?: boolean;
  payload?: unknown;
  label?: string | number;
  locale: string;
  amountLabel: string;
}) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const item = payload[0] as { value?: number };
  const amount = typeof item.value === "number" ? item.value : Number(item.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{String(label)}</p>
      <p className="text-muted-foreground">
        {amountLabel}:{" "}
        <span className="font-medium text-accent">{formatCurrency(amount, locale)}</span>
      </p>
    </div>
  );
}

export function TrackedTransfersPanel({
  data,
  transactions,
  locale,
  period,
  predicate,
  translationPrefix,
  icon: Icon,
  accentClassName = "border-accent/30 bg-gradient-to-br from-accent/5 via-card to-card",
}: TrackedTransfersPanelProps) {
  const t = useTranslations("analytics");
  const title = t(`${translationPrefix}Title`);
  const subtitle = t(`${translationPrefix}Subtitle`);

  const filtered = useMemo(
    () => sliceMonthlyTransferOverview(data, period, locale),
    [data, period, locale],
  );

  const currentMonthKey = filtered.at(-1)?.monthKey ?? "";
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);

  useEffect(() => {
    setSelectedMonthKey(currentMonthKey);
  }, [currentMonthKey, period]);

  const totals = useMemo(() => sumMonthlyTransferOverview(filtered), [filtered]);
  const currentMonth = filtered.at(-1);
  const selectedMonth = useMemo(
    () => filtered.find((row) => row.monthKey === selectedMonthKey),
    [filtered, selectedMonthKey],
  );
  const monthsWithTransfers = useMemo(
    () => [...filtered].filter((row) => row.amount > 0).reverse(),
    [filtered],
  );
  const selectedTransfers = useMemo(
    () =>
      transactions
        .filter(
          (tx) => predicate(tx) && tx.booking_date.startsWith(selectedMonthKey),
        )
        .sort((a, b) => b.booking_date.localeCompare(a.booking_date)),
    [transactions, selectedMonthKey, predicate],
  );

  const averagePerActiveMonth =
    totals.monthsWithTransfer > 0
      ? Math.round((totals.amount / totals.monthsWithTransfer) * 100) / 100
      : 0;

  const amountLabel = t(`${translationPrefix}Amount`);

  if (data.length === 0) {
    return (
      <Card className={accentClassName}>
        <CardHeader className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Icon className="size-5" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-base font-medium">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            {t(`${translationPrefix}NoneFound`)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={accentClassName}>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Icon className="size-5" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-base font-medium">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card/80 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t(`${translationPrefix}ThisMonth`)}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-accent">
              {formatCurrency(currentMonth?.amount ?? 0, locale)}
            </p>
            {currentMonth && currentMonth.transferCount > 1 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${translationPrefix}Count`, { count: currentMonth.transferCount })}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-card/80 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t(`${translationPrefix}PeriodTotal`)}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {formatCurrency(totals.amount, locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`${translationPrefix}Operations`, { count: totals.transferCount })}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card/80 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t(`${translationPrefix}Average`)}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {formatCurrency(averagePerActiveMonth, locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`${translationPrefix}ActiveMonths`, {
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
                    amountLabel={amountLabel}
                  />
                )}
              />
              <Bar
                dataKey="amount"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
                className="cursor-pointer"
                onClick={(bar) => {
                  const row = bar?.payload as MonthlyTransferOverview | undefined;
                  if (row?.monthKey) {
                    setSelectedMonthKey(row.monthKey);
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {monthsWithTransfers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("month")}</TableHead>
                <TableHead className="text-right">{amountLabel}</TableHead>
                <TableHead className="text-right">
                  {t(`${translationPrefix}OperationsShort`)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthsWithTransfers.map((row) => (
                <TableRow
                  key={row.monthKey}
                  className={cn(
                    "cursor-pointer",
                    selectedMonthKey === row.monthKey && "bg-muted/60",
                  )}
                  onClick={() => setSelectedMonthKey(row.monthKey)}
                >
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
            {t(`${translationPrefix}NoneInPeriod`)}
          </p>
        )}

        {selectedMonth ? (
          <div className="rounded-lg border border-border bg-card/80">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {t("monthDetailTitle", { month: selectedMonth.monthFull })}
              </p>
            </div>
            {selectedTransfers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("monthDetailDate")}</TableHead>
                    <TableHead>{t(`${translationPrefix}DetailDescription`)}</TableHead>
                    <TableHead className="text-right">{amountLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedTransfers.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(tx.booking_date, locale)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {tx.description}
                      </TableCell>
                      <TableCell className="text-right font-medium text-accent">
                        {formatCurrency(tx.amount, locale)}
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
  );
}
