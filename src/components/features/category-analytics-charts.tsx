/**
 * @file category-analytics-charts.tsx
 * @description Corps recharts des graphiques de dépenses par catégorie.
 *
 * Isolé pour être chargé via `next/dynamic` depuis `category-analytics.tsx`.
 */

"use client";

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
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type ChartMode = "amount" | "share";

export interface DisplaySeries {
  key: string;
  name: string;
  color: string;
}

export interface DonutDatum {
  key: string;
  name: string;
  color: string;
  value: number;
}

export type CategoryChartRow = Record<string, string | number>;

interface ChartTooltipPayloadItem {
  name?: string;
  value?: number;
  payload?: { color?: string };
  color?: string;
  dataKey?: string;
}

function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
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

export interface CategorySpendingBarsProps {
  chartData: CategoryChartRow[];
  displaySeries: DisplaySeries[];
  chartMode: ChartMode;
  monthKeys: string[];
  activeMonthKey: string | null;
  locale: string;
  totalLabel: string;
  onSelectMonth: (monthKey?: string) => void;
}

export function CategorySpendingBars({
  chartData,
  displaySeries,
  chartMode,
  monthKeys,
  activeMonthKey,
  locale,
  totalLabel,
  onSelectMonth,
}: CategorySpendingBarsProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        stackOffset={chartMode === "share" ? "expand" : "none"}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        onClick={(state) => {
          const index = (state as { activeTooltipIndex?: number })
            ?.activeTooltipIndex;
          if (typeof index === "number" && monthKeys[index]) {
            onSelectMonth(monthKeys[index]);
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
                props.payload as readonly ChartTooltipPayloadItem[] | undefined
              }
              label={props.label as string}
              locale={locale}
              totalLabel={totalLabel}
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
            radius={index === displaySeries.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
            onClick={(entry) =>
              onSelectMonth(
                (entry as { payload?: { monthKey?: string } })?.payload
                  ?.monthKey,
              )
            }
          >
            {chartData.map((row) => (
              <Cell
                key={`${series.key}-${row.monthKey}`}
                cursor="pointer"
                fillOpacity={row.monthKey === activeMonthKey ? 1 : 0.35}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface CategoryDonutProps {
  donutData: DonutDatum[];
  monthLabel: string;
  locale: string;
  totalLabel: string;
}

export function CategoryDonut({
  donutData,
  monthLabel,
  locale,
  totalLabel,
}: CategoryDonutProps) {
  return (
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
                props.payload as readonly ChartTooltipPayloadItem[] | undefined
              }
              label={monthLabel}
              locale={locale}
              totalLabel={totalLabel}
            />
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
