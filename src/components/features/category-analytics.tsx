/**
 * @file category-analytics.tsx
 * @description Analyse mensuelle des dépenses par catégorie (graphiques recharts).
 */

"use client";

import {
  CalendarRange,
  Layers,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
import { type MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  type CategoryBreakdown,
  computeCategoryTotals,
  OTHER_COLOR,
  OTHER_KEY,
  sliceCategoryMonths,
} from "@/lib/finance/category-analytics";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAR_SERIES_LIMIT = 7;
const DONUT_SERIES_LIMIT = 6;

interface CategoryAnalyticsProps {
  breakdown: CategoryBreakdown;
  locale: string;
}

type ChartMode = "amount" | "share";

interface DisplaySeries {
  key: string;
  name: string;
  color: string;
}

interface DonutDatum {
  key: string;
  name: string;
  color: string;
  value: number;
}

function formatCompactCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

interface ChartTooltipPayloadItem {
  name?: string;
  value?: number;
  payload?: { color?: string };
  color?: string;
  dataKey?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  totalLabel,
}: {
  active?: boolean;
  payload?: readonly ChartTooltipPayloadItem[];
  label?: string;
  locale: string;
  totalLabel: string;
}) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const rows = payload
    .filter((item) => typeof item.value === "number" && item.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const total = rows.reduce((sum, item) => sum + (item.value ?? 0), 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="min-w-52 rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-lg">
      <p className="mb-2 font-medium text-foreground">{label}</p>
      <div className="space-y-1.5">
        {rows.map((item) => (
          <div
            key={item.dataKey ?? item.name}
            className="flex items-center justify-between gap-6 text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: item.color ?? item.payload?.color }}
                aria-hidden
              />
              {item.name}
            </span>
            <span className="font-medium text-foreground">
              {formatCurrency(item.value ?? 0, locale)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-6 border-t border-border pt-1.5 font-medium">
        <span>{totalLabel}</span>
        <span>{formatCurrency(total, locale)}</span>
      </div>
    </div>
  );
}

export function CategoryAnalytics({
  breakdown,
  locale,
}: CategoryAnalyticsProps) {
  const t = useTranslations("categoryAnalytics");
  const [period, setPeriod] = useState<MonthlyPeriod>(6);
  const [chartMode, setChartMode] = useState<ChartMode>("amount");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const months = useMemo(
    () => sliceCategoryMonths(breakdown.months, period),
    [breakdown.months, period],
  );

  const totals = useMemo(
    () => computeCategoryTotals(months, breakdown.meta),
    [months, breakdown.meta],
  );

  const { displaySeries, chartData } = useMemo(() => {
    const top = totals.slice(0, BAR_SERIES_LIMIT);
    const restKeys = new Set(totals.slice(BAR_SERIES_LIMIT).map((c) => c.key));

    const series: DisplaySeries[] = top.map((c) => ({
      key: c.key,
      name: c.name,
      color: c.color,
    }));

    if (restKeys.size > 0) {
      series.push({ key: OTHER_KEY, name: t("other"), color: OTHER_COLOR });
    }

    const data = months.map((month) => {
      const row: Record<string, string | number> = {
        monthKey: month.monthKey,
        month: month.month,
        monthFull: month.monthFull,
        total: month.total,
      };

      let otherSum = 0;
      for (const [key, value] of Object.entries(month.values)) {
        if (restKeys.has(key)) {
          otherSum += value;
        } else {
          row[key] = value;
        }
      }
      if (restKeys.size > 0) {
        row[OTHER_KEY] = Math.round(otherSum * 100) / 100;
      }

      return row;
    });

    return { displaySeries: series, chartData: data };
  }, [totals, months, t]);

  const totalPeriod = useMemo(
    () => totals.reduce((sum, c) => sum + c.total, 0),
    [totals],
  );
  const averagePerMonth = months.length > 0 ? totalPeriod / months.length : 0;
  const topCategory = totals[0];

  const currentMonth = months.at(-1);
  const previousMonth = months.at(-2);
  const momDelta =
    currentMonth && previousMonth && previousMonth.total > 0
      ? ((currentMonth.total - previousMonth.total) / previousMonth.total) * 100
      : null;

  const selectedMonth =
    months.find((month) => month.monthKey === selectedMonthKey) ?? currentMonth;
  const activeMonthKey = selectedMonth?.monthKey ?? null;

  const handleSelectMonth = (monthKey?: string) => {
    if (monthKey) {
      setSelectedMonthKey(monthKey);
    }
  };

  const donutData = useMemo<DonutDatum[]>(() => {
    if (!selectedMonth) {
      return [];
    }

    const entries = Object.entries(selectedMonth.values)
      .map(([key, value]) => ({
        key,
        name: breakdown.meta[key]?.name ?? key,
        color: breakdown.meta[key]?.color ?? OTHER_COLOR,
        value,
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);

    const top = entries.slice(0, DONUT_SERIES_LIMIT);
    const rest = entries.slice(DONUT_SERIES_LIMIT);

    if (rest.length > 0) {
      const otherSum = rest.reduce((sum, entry) => sum + entry.value, 0);
      top.push({
        key: OTHER_KEY,
        name: t("other"),
        color: OTHER_COLOR,
        value: Math.round(otherSum * 100) / 100,
      });
    }

    return top;
  }, [selectedMonth, breakdown.meta, t]);

  if (breakdown.months.length === 0) {
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="size-4" aria-hidden />}
          tone="neutral"
          label={t("kpiTotal")}
          value={formatCurrency(totalPeriod, locale)}
          hint={t("kpiTotalHint", { count: months.length })}
        />
        <KpiCard
          icon={<CalendarRange className="size-4" aria-hidden />}
          tone="neutral"
          label={t("kpiAverage")}
          value={formatCurrency(averagePerMonth, locale)}
          hint={t("kpiAverageHint")}
        />
        <KpiCard
          icon={<Tag className="size-4" aria-hidden />}
          tone="accent"
          label={t("kpiTop")}
          value={topCategory ? topCategory.name : "—"}
          hint={
            topCategory
              ? t("kpiTopHint", {
                  amount: formatCurrency(topCategory.total, locale),
                  share: topCategory.share,
                })
              : "—"
          }
          dotColor={topCategory?.color}
        />
        <KpiCard
          icon={
            momDelta !== null && momDelta > 0 ? (
              <TrendingUp className="size-4" aria-hidden />
            ) : (
              <TrendingDown className="size-4" aria-hidden />
            )
          }
          tone={
            momDelta === null
              ? "neutral"
              : momDelta > 0
                ? "negative"
                : "positive"
          }
          label={t("kpiTrend")}
          value={
            currentMonth ? formatCurrency(currentMonth.total, locale) : "—"
          }
          hint={
            momDelta !== null
              ? t("kpiTrendHint", {
                  percent: `${momDelta > 0 ? "+" : ""}${momDelta.toFixed(1)}`,
                })
              : t("kpiTrendNoData")
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{t("chartTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("chartSubtitle")}
              </p>
            </div>
            <Tabs
              value={chartMode}
              onValueChange={(value) => setChartMode(value as ChartMode)}
            >
              <TabsList>
                <TabsTrigger value="amount" className="cursor-pointer px-3">
                  {t("modeAmount")}
                </TabsTrigger>
                <TabsTrigger value="share" className="cursor-pointer px-3">
                  {t("modeShare")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full min-w-0 [&_.recharts-bar-rectangle]:cursor-pointer [&_.recharts-surface]:cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  stackOffset={chartMode === "share" ? "expand" : "none"}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  onClick={(state) => {
                    const index = (state as { activeTooltipIndex?: number })
                      ?.activeTooltipIndex;
                    if (typeof index === "number" && months[index]) {
                      setSelectedMonthKey(months[index].monthKey);
                    }
                  }}
                >
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
                    width={56}
                    tickFormatter={(value: number) =>
                      chartMode === "share"
                        ? formatPercent(value, locale)
                        : formatCompactCurrency(value, locale)
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={(props) => (
                      <ChartTooltip
                        active={props.active}
                        payload={
                          props.payload as
                            | readonly ChartTooltipPayloadItem[]
                            | undefined
                        }
                        label={props.label as string}
                        locale={locale}
                        totalLabel={t("total")}
                      />
                    )}
                  />
                  {displaySeries.map((series, index) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.name}
                      stackId="spending"
                      fill={series.color}
                      radius={
                        index === displaySeries.length - 1 ? [4, 4, 0, 0] : 0
                      }
                      isAnimationActive={false}
                      onClick={(entry) =>
                        handleSelectMonth(
                          (entry as { payload?: { monthKey?: string } })?.payload
                            ?.monthKey,
                        )
                      }
                    >
                      {chartData.map((row) => (
                        <Cell
                          key={`${series.key}-${row.monthKey}`}
                          cursor="pointer"
                          fillOpacity={
                            row.monthKey === activeMonthKey ? 1 : 0.35
                          }
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {displaySeries.map((series) => (
                <span
                  key={series.key}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: series.color }}
                    aria-hidden
                  />
                  {series.name}
                </span>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {t("chartClickHint")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("donutTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedMonth?.monthFull ?? "—"}
            </p>
          </CardHeader>
          <CardContent>
            {donutData.length > 0 && selectedMonth ? (
              <>
                <div className="relative h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={64}
                        outerRadius={92}
                        paddingAngle={2}
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        wrapperStyle={{ zIndex: 20 }}
                        content={(props) => (
                          <ChartTooltip
                            active={props.active}
                            payload={
                              props.payload as
                                | readonly ChartTooltipPayloadItem[]
                                | undefined
                            }
                            label={selectedMonth.monthFull}
                            locale={locale}
                            totalLabel={t("total")}
                          />
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-muted-foreground">
                      {t("total")}
                    </span>
                    <span className="text-xl font-semibold tracking-tight">
                      {formatCurrency(selectedMonth.total, locale)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {donutData.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: entry.color }}
                          aria-hidden
                        />
                        <span className="truncate text-muted-foreground">
                          {entry.name}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">
                        {formatCurrency(entry.value, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
                {t("empty")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableCategory")}</TableHead>
                  <TableHead className="text-right">{t("tableTotal")}</TableHead>
                  <TableHead className="text-right">{t("tableShare")}</TableHead>
                  <TableHead className="text-right">
                    {t("tableLastMonth")}
                  </TableHead>
                  <TableHead className="text-right">{t("tableTrend")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totals.map((category) => {
                  const delta = category.lastMonth - category.previousMonth;
                  const deltaPercent =
                    category.previousMonth > 0
                      ? (delta / category.previousMonth) * 100
                      : null;
                  const isUp = delta > 0.005;
                  const isDown = delta < -0.005;

                  return (
                    <TableRow key={category.key}>
                      <TableCell>
                        <span className="flex items-center gap-2.5 font-medium">
                          <span
                            className="size-3 shrink-0 rounded-full"
                            style={{ background: category.color }}
                            aria-hidden
                          />
                          {category.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(category.total, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-2">
                          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.min(category.share, 100)}%`,
                                background: category.color,
                              }}
                            />
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {category.share.toFixed(1)}%
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(category.lastMonth, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {deltaPercent === null && delta === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1 font-normal tabular-nums",
                              isUp && "border-destructive/30 text-destructive",
                              isDown &&
                                "border-[var(--chart-2)]/30 text-[var(--chart-2)]",
                            )}
                          >
                            {isUp ? (
                              <TrendingUp className="size-3" aria-hidden />
                            ) : isDown ? (
                              <TrendingDown className="size-3" aria-hidden />
                            ) : (
                              <Layers className="size-3" aria-hidden />
                            )}
                            {deltaPercent !== null
                              ? `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(0)}%`
                              : formatCurrency(delta, locale)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
  dotColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "accent" | "positive" | "negative";
  dotColor?: string;
}) {
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone === "neutral" && "bg-muted text-foreground/70",
            tone === "accent" && "bg-accent/15 text-accent",
            tone === "positive" && "bg-[var(--chart-2)]/10 text-[var(--chart-2)]",
            tone === "negative" && "bg-destructive/10 text-destructive",
          )}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <p className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
          {dotColor ? (
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: dotColor }}
              aria-hidden
            />
          ) : null}
          <span className="truncate">{value}</span>
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
