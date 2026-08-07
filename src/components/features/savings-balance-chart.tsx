/**
 * @file savings-balance-chart.tsx
 * @description Courbe d'évolution du solde d'un compte (recharts).
 *
 * Isolé pour être chargé via `next/dynamic` : la page Épargne affiche une
 * courbe par compte, et recharts n'a pas à peser sur le bundle initial.
 */

"use client";

import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SavingsChartPoint } from "@/lib/finance/savings";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

interface ChartTooltipPayloadItem {
  value?: number;
  payload?: SavingsChartPoint;
}

function BalanceTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: readonly ChartTooltipPayloadItem[];
  locale: string;
}) {
  const tt = useTranslations("savings");
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const item = payload[0];
  const point = item.payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{point?.labelFull ?? ""}</p>
      <p className="mt-0.5 text-muted-foreground">
        {tt("balance")} : {formatCurrency(item.value ?? 0, locale)}
      </p>
    </div>
  );
}

export interface SavingsBalanceChartProps {
  data: SavingsChartPoint[];
  color: string;
  gradientId: string;
  locale: string;
  compactAxis: boolean;
}

export default function SavingsBalanceChart({
  data,
  color,
  gradientId,
  locale,
  compactAxis,
}: SavingsBalanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          interval={compactAxis ? "preserveStartEnd" : undefined}
          minTickGap={compactAxis ? 28 : undefined}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => formatCompactCurrency(value, locale)}
          className="text-muted-foreground"
          domain={["dataMin", "dataMax"]}
        />
        <ChartTooltip
          content={({ active, payload }) => (
            <BalanceTooltip
              active={active}
              payload={payload as readonly ChartTooltipPayloadItem[]}
              locale={locale}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="balance"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
