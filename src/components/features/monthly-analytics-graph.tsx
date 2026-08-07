/**
 * @file monthly-analytics-graph.tsx
 * @description Corps recharts du graphique revenus / dépenses / net.
 *
 * Isolé pour être chargé via `next/dynamic` : sans cela, recharts se retrouvait
 * dans le bundle initial de la page Analytics.
 */

"use client";

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
import type { MonthlyOverview } from "@/lib/finance/aggregates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export interface MonthlyAnalyticsGraphProps {
  data: MonthlyOverview[];
  locale: string;
  incomeLabel: string;
  expensesLabel: string;
  netLabel: string;
}

export default function MonthlyAnalyticsGraph({
  data,
  locale,
  incomeLabel,
  expensesLabel,
  netLabel,
}: MonthlyAnalyticsGraphProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          vertical={false}
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
              incomeLabel={incomeLabel}
              expensesLabel={expensesLabel}
              netLabel={netLabel}
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
  );
}
