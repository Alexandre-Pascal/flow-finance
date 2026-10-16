/**
 * @file kpi-card.tsx
 * @description Carte KPI réutilisable pour le dashboard.
 */

import type { LucideIcon } from "lucide-react";
import {
  BalanceBreakdown,
  type BalanceBreakdownRow,
} from "@/components/features/balance-breakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "accent";
  /** Détail du montant, révélé au survol. */
  breakdown?: BalanceBreakdownRow[];
  breakdownLabel?: string;
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = "default",
  breakdown,
  breakdownLabel,
}: KpiCardProps) {
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            variant === "accent"
              ? "bg-accent/15 text-accent"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </div>
      </CardHeader>
      <CardContent>
        {breakdown && breakdown.length > 0 ? (
          <BalanceBreakdown
            value={value}
            rows={breakdown}
            label={breakdownLabel ?? title}
          />
        ) : (
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        )}
        {trend ? (
          <p className="mt-1 text-xs text-muted-foreground">{trend}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
