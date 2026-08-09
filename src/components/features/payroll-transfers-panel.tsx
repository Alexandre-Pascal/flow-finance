/**
 * @file payroll-transfers-panel.tsx
 * @description Suivi mensuel des virements de salaire (mot-clé configurable).
 */

"use client";

import { Briefcase } from "lucide-react";
import { useMemo } from "react";
import { TrackedTransfersPanel } from "@/components/features/tracked-transfers-panel";
import type { MonthlyPeriod } from "@/lib/finance/aggregates";
import {
  isPayrollTransfer,
  type MonthlyTransferOverview,
} from "@/lib/finance/tracked-transfers";
import type { TransactionWithAccount } from "@/types/database";

interface PayrollTransfersPanelProps {
  data: MonthlyTransferOverview[];
  transactions: TransactionWithAccount[];
  locale: string;
  period: MonthlyPeriod;
  keyword: string;
  budgetShiftMonths: number;
}

export function PayrollTransfersPanel({
  keyword,
  budgetShiftMonths,
  ...props
}: PayrollTransfersPanelProps) {
  const predicate = useMemo(
    () => (tx: TransactionWithAccount) => isPayrollTransfer(tx, keyword),
    [keyword],
  );

  return (
    <TrackedTransfersPanel
      {...props}
      predicate={predicate}
      translationPrefix="payrollTransfer"
      icon={Briefcase}
      accentClassName="border-[var(--chart-2)]/30 bg-gradient-to-br from-[var(--chart-2)]/5 via-card to-card"
      budgetMonthShift={budgetShiftMonths}
      payrollKeyword={keyword}
      subtitleValues={{ keyword, shift: budgetShiftMonths }}
    />
  );
}
