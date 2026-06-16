/**
 * @file transactions-table.tsx
 * @description Tableau des transactions avec type de dépense.
 */

"use client";

import {
  CalendarDays,
  ListFilter,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignTransactionCategoryAction } from "@/app/actions/categories";
import { updateTransactionNoteAction } from "@/app/actions/transactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function formatMonthKey(key: string, locale: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function monthKeyOffset(offset: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
    <Badge
      variant="outline"
      className="h-8 w-full max-w-[180px] justify-start gap-1.5 px-3 font-normal"
    >
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

function TransactionNote({
  tx,
  isDemo,
}: {
  tx: TransactionWithAccount;
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(tx.note ?? "");
  const [isPending, startTransition] = useTransition();

  const hasNote = Boolean(tx.note && tx.note.trim());

  function persist(note: string) {
    if (isDemo) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("note", note);
    startTransition(async () => {
      const result = await updateTransactionNoteAction(formData);
      if (!result.error) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(tx.note ?? "");
        }
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={hasNote ? t("noteEdit") : t("noteAdd")}
              className={cn(
                "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-colors hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
                hasNote
                  ? "text-[var(--chart-3)]"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <StickyNote
                className="size-3.5"
                fill={hasNote ? "currentColor" : "none"}
                aria-hidden
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {hasNote && !open ? (
          <TooltipContent className="whitespace-pre-wrap">
            {tx.note}
          </TooltipContent>
        ) : null}
      </Tooltip>

      <PopoverContent className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("noteLabel")}
        </p>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("notePlaceholder")}
          maxLength={280}
          disabled={isPending || isDemo}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              persist(value);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          {hasNote ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="cursor-pointer text-muted-foreground hover:text-destructive"
              disabled={isPending || isDemo}
              onClick={() => persist("")}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("noteDelete")}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            disabled={isPending || isDemo}
            onClick={() => persist(value)}
          >
            {t("noteSave")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const tx of transactions) {
      keys.add(tx.booking_date.slice(0, 7));
    }
    return [...keys]
      .sort()
      .reverse()
      .map((key) => ({ key, label: formatMonthKey(key, locale) }));
  }, [transactions, locale]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorized = 0;
    for (const tx of transactions) {
      if (
        selectedMonths.size > 0 &&
        !selectedMonths.has(tx.booking_date.slice(0, 7))
      ) {
        continue;
      }
      if (tx.category_id) {
        counts.set(tx.category_id, (counts.get(tx.category_id) ?? 0) + 1);
      } else if (tx.amount < 0 && !tx.recurring_payment_id) {
        uncategorized += 1;
      }
    }
    return { counts, uncategorized };
  }, [transactions, selectedMonths]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (selectedMonths.size > 0 && !selectedMonths.has(tx.booking_date.slice(0, 7))) {
        return false;
      }
      if (query) {
        const haystack = [
          tx.description,
          tx.recurring_payment_name ?? "",
          tx.category_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      if (categoryFilter === "uncategorized") {
        return tx.amount < 0 && !tx.recurring_payment_id && !tx.category_id;
      }
      if (categoryFilter !== "all") {
        return tx.category_id === categoryFilter;
      }
      return true;
    });
  }, [transactions, categoryFilter, selectedMonths, search]);

  function toggleMonth(key: string) {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const monthSummary =
    selectedMonths.size === 0
      ? t("monthAll")
      : selectedMonths.size === 1
        ? formatMonthKey([...selectedMonths][0], locale)
        : t("monthCount", { count: selectedMonths.size });

  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noResults")}
      </p>
    );
  }

  const table =
    filtered.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noResults")}
      </p>
    ) : (
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
          {filtered.map((tx) => (
          <TableRow key={tx.id} className="group transition-colors duration-150">
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(tx.booking_date, locale)}
            </TableCell>
            <TableCell className="max-w-[200px] font-medium md:max-w-xs">
              <span className="flex items-center gap-1.5">
                <span className="truncate">{tx.description}</span>
                {!compact ? (
                  <TransactionNote tx={tx} isDemo={isDemo} />
                ) : null}
              </span>
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

  if (compact) {
    return table;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-9 pl-9"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <ListFilter
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger
                size="sm"
                className="h-9 w-full max-w-[240px] cursor-pointer sm:w-[200px]"
                aria-label={t("filterLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all" className="cursor-pointer">
                  {t("filterAll")}
                </SelectItem>
                <SelectItem
                  value="uncategorized"
                  className={cn(
                    "cursor-pointer",
                    categoryCounts.uncategorized === 0 && "text-muted-foreground/60",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span>{t("filterUncategorized")}</span>
                    <span className="ml-auto pr-1 text-xs tabular-nums text-muted-foreground">
                      {categoryCounts.uncategorized}
                    </span>
                  </span>
                </SelectItem>
                {uniqueCategories.map((category) => {
                  const count = categoryCounts.counts.get(category.id) ?? 0;
                  const isEmpty = count === 0;
                  return (
                    <SelectItem
                      key={category.id}
                      value={category.id}
                      className={cn(
                        "cursor-pointer",
                        isEmpty && "text-muted-foreground/60",
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            isEmpty && "opacity-40",
                          )}
                          style={{ backgroundColor: category.color }}
                          aria-hidden
                        />
                        <span>{category.name}</span>
                        <span className="ml-auto pr-1 text-xs tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 cursor-pointer justify-start gap-2 font-normal"
              >
                <CalendarDays
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="truncate capitalize">{monthSummary}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setSelectedMonths(new Set())}
              >
                {t("monthAll")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setSelectedMonths(new Set([monthKeyOffset(0)]))}
              >
                {t("monthThis")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setSelectedMonths(new Set([monthKeyOffset(1)]))}
              >
                {t("monthLast")}
              </DropdownMenuItem>
              {monthOptions.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t("monthPick")}</DropdownMenuLabel>
                  <div className="max-h-64 overflow-y-auto">
                    {monthOptions.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.key}
                        checked={selectedMonths.has(option.key)}
                        onCheckedChange={() => toggleMonth(option.key)}
                        onSelect={(event) => event.preventDefault()}
                        className="cursor-pointer capitalize"
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="text-sm text-muted-foreground">
          {t("filterCount", { count: filtered.length })}
        </span>
      </div>

      {table}
    </div>
  );
}
