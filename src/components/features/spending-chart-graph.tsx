/**
 * @file spending-chart-graph.tsx
 * @description Corps recharts du graphique des dépenses mensuelles.
 *
 * Isolé dans son propre module pour que `spending-chart.tsx` puisse le charger
 * via `next/dynamic` : recharts est une dépendance lourde et n'a pas à être
 * dans le bundle initial du dashboard.
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

export interface SpendingChartGraphProps {
  data: { month: string; amount: number }[];
}

export default function SpendingChartGraph({ data }: SpendingChartGraphProps) {
  return (
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
  );
}
