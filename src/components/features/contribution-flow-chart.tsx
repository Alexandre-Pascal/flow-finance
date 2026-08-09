/**
 * @file contribution-flow-chart.tsx
 * @description Histogramme du versement net mensuel (positif / négatif).
 */

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ContributionEnvelope,
  MonthlyContribution,
} from "@/lib/finance/contribution-flow";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

const POSITIVE_FILL = "var(--chart-2)";
const NEGATIVE_FILL = "var(--destructive)";

interface ContributionFlowChartProps {
  months: MonthlyContribution[];
  envelopes: ContributionEnvelope[];
  locale: string;
  netLabel: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: { monthKey?: string; net?: number } }>;
  label?: string | number;
  locale: string;
  netLabel: string;
  months: MonthlyContribution[];
  envelopes: ContributionEnvelope[];
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  netLabel,
  months,
  envelopes,
}: TooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const monthKey = payload[0]?.payload?.monthKey;
  const month =
    months.find((row) => row.monthKey === monthKey) ??
    months.find((row) => row.month === String(label));
  if (!month) return null;

  const envelopeRows = envelopes
    .map((envelope) => ({
      ...envelope,
      value: month.byEnvelope[envelope.id] ?? 0,
    }))
    .filter((row) => row.value !== 0);

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-2 font-medium text-foreground">{month.monthFull}</p>
      <div className="space-y-1">
        {envelopeRows.map((row) => (
          <p
            key={row.id}
            className="flex items-center justify-between gap-6 text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              {row.name}
            </span>
            <span className="tabular-nums font-medium text-foreground">
              {formatCurrency(row.value, locale)}
            </span>
          </p>
        ))}
        <p className="flex items-center justify-between gap-6 border-t border-border pt-1 text-muted-foreground">
          <span>{netLabel}</span>
          <span
            className={
              month.net >= 0
                ? "tabular-nums font-medium text-[var(--chart-2)]"
                : "tabular-nums font-medium text-destructive"
            }
          >
            {formatCurrency(month.net, locale)}
          </span>
        </p>
      </div>
    </div>
  );
}

export default function ContributionFlowChart({
  months,
  envelopes,
  locale,
  netLabel,
}: ContributionFlowChartProps) {
  const data = months.map((month) => ({
    monthKey: month.monthKey,
    month: month.month,
    net: month.net,
  }));

  const hasNegative = months.some((month) => month.net < 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value: number) => formatCompactCurrency(value, locale)}
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
        />
        {hasNegative ? (
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
        ) : null}
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltip
              locale={locale}
              netLabel={netLabel}
              months={months}
              envelopes={envelopes}
            />
          }
        />
        <Bar dataKey="net" name={netLabel} maxBarSize={40} radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={entry.net >= 0 ? POSITIVE_FILL : NEGATIVE_FILL}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
