/**
 * @file incoming-transfers-panel.tsx
 * @description Suivi mensuel des rentrées non salariales (plusieurs sources).
 */

"use client";

import { Gift } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TrackedTransfersPanel } from "@/components/features/tracked-transfers-panel";
import { Button } from "@/components/ui/button";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  isTrackedIncomeTransfer,
  type MonthlyTransferOverview,
} from "@/lib/finance/tracked-transfers";
import type { ProfileTrackedIncomeSource } from "@/lib/profile-settings";
import type { TransactionWithAccount } from "@/types/database";

interface IncomingSourceSeries {
  source: ProfileTrackedIncomeSource;
  data: MonthlyTransferOverview[];
}

interface IncomingTransfersPanelProps {
  series: IncomingSourceSeries[];
  transactions: TransactionWithAccount[];
  locale: string;
  period: MonthlyPeriod;
}

export function IncomingTransfersPanel({
  series,
  transactions,
  locale,
  period,
}: IncomingTransfersPanelProps) {
  const t = useTranslations("analytics");
  const [selectedId, setSelectedId] = useState(series[0]?.source.id ?? "");

  const selected =
    series.find((row) => row.source.id === selectedId) ?? series[0] ?? null;

  const predicate = useMemo(() => {
    const source = selected?.source;
    return (tx: TransactionWithAccount) => isTrackedIncomeTransfer(tx, source);
  }, [selected?.source]);

  if (!selected) {
    return null;
  }

  const keywordPreview = selected.source.keywords.join(" · ");

  return (
    <div className="space-y-4">
      {series.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {series.map((row) => (
            <Button
              key={row.source.id}
              type="button"
              size="sm"
              variant={
                row.source.id === selected.source.id ? "default" : "outline"
              }
              className="cursor-pointer"
              onClick={() => setSelectedId(row.source.id)}
            >
              {row.source.label}
            </Button>
          ))}
        </div>
      ) : null}

      <TrackedTransfersPanel
        data={selected.data}
        transactions={transactions}
        locale={locale}
        period={period}
        predicate={predicate}
        translationPrefix="motherTransfer"
        icon={Gift}
        titleValues={{ label: selected.source.label }}
        subtitleValues={{
          label: selected.source.label,
          keyword: keywordPreview,
        }}
      />

      {series.length === 1 ? null : (
        <p className="text-xs text-muted-foreground">
          {t("incomingTransferSourcesHint", { count: series.length })}
        </p>
      )}
    </div>
  );
}
