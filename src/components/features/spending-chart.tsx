/**
 * @file spending-chart.tsx
 * @description Graphique des dépenses mensuelles (recharts).
 */

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SpendingChartProps {
  data: { month: string; amount: number }[];
  title: string;
}

export function SpendingChart({ data, title }: SpendingChartProps) {
  return (
    <div className="h-64 min-h-64 w-full min-w-0">
      <p className="mb-4 text-sm font-medium text-muted-foreground">{title}</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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
            width={48}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--card)",
            }}
          />
          <Bar
            dataKey="amount"
            fill="var(--chart-3)"
            radius={[4, 4, 0, 0]}
            name="EUR"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
