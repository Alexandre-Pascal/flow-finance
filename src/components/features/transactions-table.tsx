/**
 * @file transactions-table.tsx
 * @description Tableau des transactions avec type de dépense.
 */

"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignTransactionCategoryAction } from "@/app/actions/categories";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dedupeCategories } from "@/lib/finance/expense-categories";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Category, TransactionWithAccount } from "@/types/database";
import { cn } from "@/lib/utils";

interface TransactionsTableProps {
  transactions: TransactionWithAccount[];
  categories: Category[];
  locale: string;
  compact?: boolean;
  isDemo?: boolean;
}

function ExpenseTypeBadge({
  label,
  color,
  sublabel,
}: {
  label: string;
  color?: string;
  sublabel?: string;
}) {
  return (
    <Badge variant="outline" className="max-w-[140px] gap-1.5 font-normal">
      {color ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : null}
      <span className="truncate">
        {label}
        {sublabel ? (
          <span className="text-muted-foreground"> · {sublabel}</span>
        ) : null}
      </span>
    </Badge>
  );
}

function CategorySelect({
  tx,
  categories,
  isDemo,
}: {
  tx: TransactionWithAccount;
  categories: Category[];
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function handleCategoryChange(value: string) {
    if (isDemo || value === (tx.category_id ?? "none")) {
      return;
    }

    setError(false);
    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("categoryId", value);

    startTransition(async () => {
      const result = await assignTransactionCategoryAction(formData);
      if (result.error) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Select
      value={tx.category_id ?? "none"}
      onValueChange={handleCategoryChange}
      disabled={isPending || isDemo}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "h-8 w-full max-w-[180px] cursor-pointer",
          error && "border-destructive",
        )}
        aria-label={t("expenseType")}
      >
        <SelectValue placeholder={t("expenseTypeNone")} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="none" className="cursor-pointer">
          {t("expenseTypeNone")}
        </SelectItem>
        {categories.map((category) => (
          <SelectItem
            key={category.id}
            value={category.id}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden
              />
              {category.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TransactionExpenseType({
  tx,
  categories,
  compact,
  isDemo,
}: {
  tx: TransactionWithAccount;
  categories: Category[];
  compact: boolean;
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");

  if (tx.amount >= 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (tx.recurring_payment_name) {
    const isPayPal = tx.description.toUpperCase().includes("PAYPAL");
    return (
      <ExpenseTypeBadge
        label={tx.recurring_payment_name}
        sublabel={
          isPayPal ? t("expenseTypePaypal") : t("expenseTypeRecurring")
        }
      />
    );
  }

  if (compact) {
    if (tx.category_name) {
      return (
        <ExpenseTypeBadge
          label={tx.category_name}
          color={tx.category_color ?? undefined}
        />
      );
    }

    return (
      <span className="text-xs text-muted-foreground">{t("expenseTypeNone")}</span>
    );
  }

  return <CategorySelect tx={tx} categories={categories} isDemo={isDemo} />;
}

export function TransactionsTable({
  transactions,
  categories,
  locale,
  compact = false,
  isDemo = false,
}: TransactionsTableProps) {
  const t = useTranslations("transactions");
  const uniqueCategories = useMemo(
    () => dedupeCategories(categories),
    [categories],
  );

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
          <TableHead className="text-right">{t("amount")}</TableHead>
          <TableHead>{t("expenseType")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id} className="transition-colors duration-150">
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(tx.booking_date, locale)}
            </TableCell>
            <TableCell className="max-w-[200px] truncate font-medium md:max-w-xs">
              {tx.description}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-semibold tabular-nums",
                tx.amount < 0
                  ? "text-foreground"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {formatCurrency(tx.amount, locale, tx.currency)}
            </TableCell>
            <TableCell>
              <TransactionExpenseType
                tx={tx}
                categories={uniqueCategories}
                compact={compact}
                isDemo={isDemo}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
