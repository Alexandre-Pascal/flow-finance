/**
 * @file savings-analytics.tsx
 * @description Page Épargne : soldes, évolution et mouvements par support.
 */

"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  PiggyBank,
  Repeat,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  PEL_META,
  SAVINGS_VEHICLE_COLORS,
  type PelMeta,
  type SavingsOverview,
  type SavingsVehicleKey,
} from "@/lib/finance/savings";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SavingsAnalyticsProps {
  overview: SavingsOverview;
  locale: string;
}

function formatCompactCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function SavingsAnalytics({ overview, locale }: SavingsAnalyticsProps) {
  const t = useTranslations("savings");
  const [period, setPeriod] = useState<MonthlyPeriod>(12);

  const vehicleName = (key: SavingsVehicleKey) =>
    key === "livret" ? t("vehicleLivret") : t("vehiclePel");

  const totalNetThisMonth = overview.vehicles.reduce(
    (sum, vehicle) => sum + (vehicle.monthly.at(-1)?.net ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-1 sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalBalance")}
            </CardTitle>
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Wallet className="size-4" aria-hidden />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatCurrency(overview.totalBalance, locale)}
            </p>
            <p
              className={cn(
                "mt-1 text-xs",
                totalNetThisMonth > 0
                  ? "text-[var(--chart-2)]"
                  : totalNetThisMonth < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {t("netThisMonth", {
                amount: `${totalNetThisMonth >= 0 ? "+" : ""}${formatCurrency(totalNetThisMonth, locale)}`,
              })}
            </p>
          </CardContent>
        </Card>

        {overview.vehicles.map((vehicle) => {
          const net = vehicle.monthly.at(-1)?.net ?? 0;
          return (
            <Card key={vehicle.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {vehicleName(vehicle.key)}
                </CardTitle>
                <div
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${SAVINGS_VEHICLE_COLORS[vehicle.key]}1a`,
                    color: SAVINGS_VEHICLE_COLORS[vehicle.key],
                  }}
                >
                  <PiggyBank className="size-4" aria-hidden />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatCurrency(vehicle.balance, locale)}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    net > 0
                      ? "text-[var(--chart-2)]"
                      : net < 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {t("netThisMonth", {
                    amount: `${net >= 0 ? "+" : ""}${formatCurrency(net, locale)}`,
                  })}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("chartTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("chartSubtitle")}
          </p>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {overview.vehicles.map((vehicle) => (
          <VehicleChart
            key={vehicle.key}
            vehicle={vehicle}
            period={period}
            locale={locale}
            name={vehicleName(vehicle.key)}
            color={SAVINGS_VEHICLE_COLORS[vehicle.key]}
            emptyLabel={t("empty")}
            balanceLabel={t("balanceLabel")}
            netLabel={t("netLabel")}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {overview.vehicles.map((vehicle) =>
          vehicle.key === "pel" ? (
            <PelDetailCard
              key={vehicle.key}
              meta={PEL_META}
              locale={locale}
              name={vehicleName(vehicle.key)}
              color={SAVINGS_VEHICLE_COLORS[vehicle.key]}
            />
          ) : (
            <LivretDetailCard
              key={vehicle.key}
              vehicle={vehicle}
              locale={locale}
              name={vehicleName(vehicle.key)}
              color={SAVINGS_VEHICLE_COLORS[vehicle.key]}
            />
          ),
        )}
      </div>
    </div>
  );
}

function MovementsList({
  vehicle,
  locale,
}: {
  vehicle: SavingsOverview["vehicles"][number];
  locale: string;
}) {
  const t = useTranslations("savings");

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">
        {t("movementsTitle")}
      </p>
      {vehicle.movements.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("noMovements")}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto pr-1">
          {vehicle.movements.map((movement) => (
            <li
              key={movement.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {movement.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(movement.date, locale)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-medium tabular-nums",
                  movement.amount >= 0
                    ? "text-[var(--chart-2)]"
                    : "text-destructive",
                )}
              >
                {movement.amount >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(movement.amount), locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LivretDetailCard({
  vehicle,
  locale,
  name,
  color,
}: {
  vehicle: SavingsOverview["vehicles"][number];
  locale: string;
  name: string;
  color: string;
}) {
  const t = useTranslations("savings");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className="size-2.5 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            icon={<ArrowUpRight className="size-4" aria-hidden />}
            tone="positive"
            label={t("deposits")}
            value={formatCurrency(vehicle.totalDeposits, locale)}
          />
          <Stat
            icon={<ArrowDownRight className="size-4" aria-hidden />}
            tone="negative"
            label={t("withdrawals")}
            value={formatCurrency(vehicle.totalWithdrawals, locale)}
          />
        </div>
        <MovementsList vehicle={vehicle} locale={locale} />
      </CardContent>
    </Card>
  );
}

function PelDetailCard({
  meta,
  locale,
  name,
  color,
}: {
  meta: PelMeta;
  locale: string;
  name: string;
  color: string;
}) {
  const t = useTranslations("savings");
  const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
  const ceilingProgress = Math.min(
    100,
    (meta.balanceWithInterest / meta.ceiling) * 100,
  );
  const rateLabel = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    minimumFractionDigits: 2,
  }).format(meta.rate);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className="size-2.5 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          {name}
        </CardTitle>
        <p className="mt-1 text-2xl font-semibold tracking-tight">
          {formatCurrency(meta.balanceWithInterest, locale)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("principalHint", {
            amount: formatCurrency(meta.principal, locale),
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("ceiling")}</span>
            <span>{formatCurrency(meta.ceiling, locale)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${ceilingProgress}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat
            icon={<Repeat className="size-4" aria-hidden />}
            tone="neutral"
            label={t("monthlyDeposit")}
            value={formatCurrency(meta.monthlyDeposit, locale)}
          />
          <Stat
            icon={<TrendingUp className="size-4" aria-hidden />}
            tone="positive"
            label={t("interestAcquired")}
            value={formatCurrency(meta.interest, locale)}
            hint={t("rateHint", { rate: rateLabel })}
          />
          <Stat
            icon={<CalendarClock className="size-4" aria-hidden />}
            tone="neutral"
            label={t("remainingToDeposit")}
            value={formatCurrency(meta.remainingToDeposit, locale)}
            hint={t("remainingBefore", {
              date: formatDate(meta.remainingDeadline, locale),
            })}
          />
          <Stat
            icon={<CalendarDays className="size-4" aria-hidden />}
            tone="neutral"
            label={t("opening")}
            value={formatDate(meta.openingDate, locale)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function VehicleChart({
  vehicle,
  period,
  locale,
  name,
  color,
  emptyLabel,
  balanceLabel,
  netLabel,
}: {
  vehicle: SavingsOverview["vehicles"][number];
  period: MonthlyPeriod;
  locale: string;
  name: string;
  color: string;
  emptyLabel: string;
  balanceLabel: string;
  netLabel: string;
}) {
  const data = useMemo(
    () =>
      period === "all" ? vehicle.monthly : vehicle.monthly.slice(-period),
    [vehicle.monthly, period],
  );

  const gradientId = `savings-${vehicle.key}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span
              className="size-2.5 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            {name}
          </CardTitle>
          <p className="mt-1 text-xl font-semibold tracking-tight">
            {formatCurrency(vehicle.balance, locale)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-border"
                />
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
                  width={64}
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) =>
                    formatCompactCurrency(value, locale)
                  }
                />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={({ active, payload }) => {
                    if (
                      !active ||
                      !Array.isArray(payload) ||
                      payload.length === 0
                    ) {
                      return null;
                    }
                    const point = payload[0]
                      ?.payload as SavingsOverview["vehicles"][number]["monthly"][number];
                    return (
                      <div className="min-w-44 rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-lg">
                        <p className="mb-2 font-medium text-foreground">
                          {point.monthFull}
                        </p>
                        <div className="flex items-center justify-between gap-6 text-muted-foreground">
                          <span>{balanceLabel}</span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(point.balance, locale)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-6 text-muted-foreground">
                          <span>{netLabel}</span>
                          <span
                            className={cn(
                              "font-medium",
                              point.net > 0
                                ? "text-[var(--chart-2)]"
                                : point.net < 0
                                  ? "text-destructive"
                                  : "text-foreground",
                            )}
                          >
                            {point.net >= 0 ? "+" : "−"}
                            {formatCurrency(Math.abs(point.net), locale)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
  hint,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-md",
            tone === "positive" && "bg-[var(--chart-2)]/10 text-[var(--chart-2)]",
            tone === "negative" && "bg-destructive/10 text-destructive",
            tone === "neutral" && "bg-muted text-foreground/70",
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
