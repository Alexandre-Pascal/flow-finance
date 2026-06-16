/**
 * @file transactions-table.tsx
 * @description Tableau des transactions avec formatage monétaire.
 */

"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TransactionWithAccount } from "@/types/database";
import { cn } from "@/lib/utils";

interface TransactionsTableProps {
  transactions: TransactionWithAccount[];
  locale: string;
  compact?: boolean;
}

export function TransactionsTable({
  transactions,
  locale,
  compact = false,
}: TransactionsTableProps) {
  const t = useTranslations("transactions");

  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noResults")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("date")}</TableHead>
          <TableHead>{t("description")}</TableHead>
          {!compact && <TableHead>{t("account")}</TableHead>}
          <TableHead className="text-right">{t("amount")}</TableHead>
          {!compact && <TableHead>{t("status")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id} className="transition-colors duration-150">
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(tx.booking_date, locale)}
            </TableCell>
            <TableCell className="max-w-[200px] truncate font-medium md:max-w-xs">
              <div className="flex flex-col gap-1">
                <span>{tx.description}</span>
                {tx.recurring_payment_name ? (
                  <Badge variant="outline" className="w-fit font-normal">
                    {tx.recurring_payment_name}
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            {!compact && (
              <TableCell className="text-muted-foreground">
                {tx.account_name}
              </TableCell>
            )}
            <TableCell
              className={cn(
                "text-right font-semibold tabular-nums",
                tx.amount < 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {formatCurrency(tx.amount, locale, tx.currency)}
            </TableCell>
            {!compact && (
              <TableCell>
                <Badge variant={tx.status === "BOOK" ? "secondary" : "outline"}>
                  {tx.status === "BOOK" ? t("booked") : t("pending")}
                </Badge>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
