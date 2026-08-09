/**
 * @file mother-transfers-panel.tsx
 * @description Suivi mensuel des virements d'une personne configurée.
 */

"use client";

import { Gift } from "lucide-react";
import { useMemo } from "react";
import { TrackedTransfersPanel } from "@/components/features/tracked-transfers-panel";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  isTrackedPersonTransfer,
  type MonthlyTransferOverview,
} from "@/lib/finance/tracked-transfers";
import type { TransactionWithAccount } from "@/types/database";

interface MotherTransfersPanelProps {
  data: MonthlyTransferOverview[];
  transactions: TransactionWithAccount[];
  locale: string;
  period: MonthlyPeriod;
  keyword: string;
  label: string;
}

export function MotherTransfersPanel({
  keyword,
  label,
  ...props
}: MotherTransfersPanelProps) {
  const predicate = useMemo(
    () => (tx: TransactionWithAccount) => isTrackedPersonTransfer(tx, keyword),
    [keyword],
  );

  return (
    <TrackedTransfersPanel
      {...props}
      predicate={predicate}
      translationPrefix="motherTransfer"
      icon={Gift}
      titleValues={{ label }}
      subtitleValues={{ label, keyword }}
    />
  );
}
