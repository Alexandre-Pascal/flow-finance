/**
 * @file outgoing-transfers-panel.tsx
 * @description Suivi mensuel des virements émis vers plusieurs destinataires.
 */

"use client";

import { Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TrackedTransfersPanel } from "@/components/features/tracked-transfers-panel";
import { Button } from "@/components/ui/button";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  isTrackedOutgoingTransfer,
  type MonthlyTransferOverview,
} from "@/lib/finance/tracked-transfers";
import type { ProfileTrackedOutgoingPerson } from "@/lib/profile-settings";
import type { TransactionWithAccount } from "@/types/database";

interface OutgoingPersonSeries {
  person: ProfileTrackedOutgoingPerson;
  data: MonthlyTransferOverview[];
}

interface OutgoingTransfersPanelProps {
  series: OutgoingPersonSeries[];
  transactions: TransactionWithAccount[];
  locale: string;
  period: MonthlyPeriod;
}

export function OutgoingTransfersPanel({
  series,
  transactions,
  locale,
  period,
}: OutgoingTransfersPanelProps) {
  const t = useTranslations("analytics");
  const [selectedId, setSelectedId] = useState(series[0]?.person.id ?? "");

  const selected =
    series.find((row) => row.person.id === selectedId) ?? series[0] ?? null;

  const predicate = useMemo(() => {
    const keyword = selected?.person.keyword ?? "";
    return (tx: TransactionWithAccount) =>
      isTrackedOutgoingTransfer(tx, keyword);
  }, [selected?.person.keyword]);

  if (!selected) {
    return null;
  }

  return (
    <div className="space-y-4">
      {series.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {series.map((row) => (
            <Button
              key={row.person.id}
              type="button"
              size="sm"
              variant={
                row.person.id === selected.person.id ? "default" : "outline"
              }
              className="cursor-pointer"
              onClick={() => setSelectedId(row.person.id)}
            >
              {row.person.label}
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
        translationPrefix="outgoingTransfer"
        icon={Send}
        titleValues={{ label: selected.person.label }}
        subtitleValues={{
          label: selected.person.label,
          keyword: selected.person.keyword,
        }}
      />

      {series.length === 1 ? null : (
        <p className="text-xs text-muted-foreground">
          {t("outgoingTransferPeopleHint", { count: series.length })}
        </p>
      )}
    </div>
  );
}
