/**
 * @file spending-chart.tsx
 * @description Graphique des dépenses mensuelles (recharts, chargé à la demande).
 */

"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// `ssr: false` évite de rendre le graphique côté serveur : recharts a besoin
// des dimensions réelles du conteneur, ce qui produisait à chaque rendu les
// avertissements « width(-1) and height(-1) of chart should be greater than 0 ».
const SpendingChartGraph = dynamic(
  () => import("@/components/features/spending-chart-graph"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  },
);

interface SpendingChartProps {
  data: { month: string; amount: number }[];
  title: string;
}

export function SpendingChart({ data, title }: SpendingChartProps) {
  return (
    <div className="h-64 min-h-64 w-full min-w-0">
      {title ? (
        <p className="mb-4 text-sm font-medium text-muted-foreground">{title}</p>
      ) : null}
      <SpendingChartGraph data={data} />
    </div>
  );
}
