/**
 * @file transactions-table.tsx
 * @description Tableau des transactions avec type de dépense.
 */

"use client";

import {
  ArrowLeftRight,
  CalendarDays,
  ListFilter,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignTransactionCategoryAction } from "@/app/actions/categories";
import {
  assignTransactionPeaPlanAction,
  syncPeaBankTransfersAction,
} from "@/app/actions/pea";
import { assignTransactionSavingsAccountAction } from "@/app/actions/savings";
import {
  assignTransactionIncomeSourceAction,
  assignTransactionTransferAccountAction,
} from "@/app/actions/transactions";
import { updateTransactionNoteAction } from "@/app/actions/transactions";
import { CreatePocketDialog } from "@/components/features/create-pocket-dialog";
import { MarkAsSubscriptionDialog } from "@/components/features/mark-as-subscription-dialog";
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
import {
  isPayrollTransfer,
  isTrackedIncomeTransfer,
  PAYROLL_INCOME_KEY,
} from "@/lib/finance/tracked-transfers";
import { isNeutralTransfer } from "@/lib/finance/account-transfers";
import type { ProfileTrackedIncomeSource } from "@/lib/profile-settings";
import type {
  Account,
  Category,
  PeaInvestmentPlan,
  RecurringPayment,
  SavingsAccount,
  TransactionWithAccount,
} from "@/types/database";
import { cn } from "@/lib/utils";

/** Nombre de lignes rendues par tranche (voir `visibleCount`). */
const PAGE_SIZE = 60;

interface TransactionsTableProps {
  transactions: TransactionWithAccount[];
  categories: Category[];
  locale: string;
  savingsAccounts?: SavingsAccount[];
  /** Plans d'investissement PEA, pour l'affectation manuelle d'un virement. */
  peaInvestmentPlans?: PeaInvestmentPlan[];
  /** Abonnements existants, pour proposer un rattachement depuis une transaction. */
  recurringPayments?: RecurringPayment[];
  /** Comptes de l'espace courant : les onglets de filtrage. */
  accounts?: Account[];
  /** Tous les comptes, tous espaces : cibles possibles d'un virement. */
  transferAccounts?: Account[];
  /** Sources de rentrées configurées, pour rattacher une entrée à la main. */
  incomeSources?: ProfileTrackedIncomeSource[];
  /** Mot-clé du salaire, pour afficher la source détectée automatiquement. */
  payrollKeyword?: string | null;
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

function SavingsTransferBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="h-8 max-w-[180px] justify-start gap-1.5 px-3 font-normal text-muted-foreground"
    >
      <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

function PeaAssign({
  tx,
  peaInvestmentPlans,
  isDemo,
}: {
  tx: TransactionWithAccount;
  peaInvestmentPlans: PeaInvestmentPlan[];
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ref = tx.pea_transfer;
  const currentId = ref?.plan_id ?? null;
  const isManual = Boolean(tx.pea_manual);
  const activePlans = peaInvestmentPlans.filter((plan) => plan.active);

  const label = ref
    ? ref.direction === "deposit"
      ? t("peaDepositTo", { name: ref.plan_label })
      : t("peaWithdrawalFrom", { name: ref.plan_label })
    : t("peaAssignPlaceholder");

  function assign(value: string) {
    if (isDemo) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("planId", value === "auto" ? "" : value);

    startTransition(async () => {
      const result = await assignTransactionPeaPlanAction(formData);
      if (result.error) {
        return;
      }
      // Matérialise immédiatement le versement et l'estimation de parts.
      await syncPeaBankTransfersAction();
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending || isDemo}
          className={cn(
            "inline-flex h-8 max-w-[180px] cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-normal text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
          )}
          aria-label={t("peaAssignLabel")}
        >
          <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("peaAssignLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {activePlans.map((plan) => (
          <DropdownMenuCheckboxItem
            key={plan.id}
            checked={isManual && currentId === plan.id}
            onCheckedChange={() => assign(plan.id)}
            className="cursor-pointer"
          >
            {plan.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={!isManual}
          onCheckedChange={() => assign("auto")}
          className="cursor-pointer"
        >
          {t("peaAssignAuto")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SavingsAssign({
  tx,
  savingsAccounts,
  isDemo,
}: {
  tx: TransactionWithAccount;
  savingsAccounts: SavingsAccount[];
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ref = tx.savings_transfer;
  const currentId = ref?.account_id ?? null;
  const isManual = Boolean(tx.savings_account_manual);

  const label = ref
    ? ref.direction === "deposit"
      ? t("savingsDepositTo", { name: ref.account_name })
      : t("savingsWithdrawalFrom", { name: ref.account_name })
    : t("savingsAssignPlaceholder");

  function assign(value: string) {
    if (isDemo) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("savingsAccountId", value);
    startTransition(async () => {
      const result = await assignTransactionSavingsAccountAction(formData);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending || isDemo}
          className={cn(
            "inline-flex h-8 max-w-[180px] cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-normal text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
          )}
          aria-label={t("savingsAssignLabel")}
        >
          <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("savingsAssignLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {savingsAccounts.map((account) => (
          <DropdownMenuCheckboxItem
            key={account.id}
            checked={isManual && currentId === account.id}
            onCheckedChange={() => assign(account.id)}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: account.color }}
                aria-hidden
              />
              {account.name}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={!isManual}
          onCheckedChange={() => assign("auto")}
          className="cursor-pointer"
        >
          {t("savingsAssignAuto")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Libellé d'un virement interne, selon qu'on sache nommer la contrepartie. */
function transferLabel(
  ref: NonNullable<TransactionWithAccount["account_transfer"]>,
  t: ReturnType<typeof useTranslations<"transactions">>,
): string {
  if (!ref.counterpart_account_name) {
    return t("transferSelf");
  }
  return ref.direction === "out"
    ? t("transferTo", { name: ref.counterpart_account_name })
    : t("transferFrom", { name: ref.counterpart_account_name });
}

/** Déclare, corrige ou retire un virement entre deux comptes de l'utilisateur. */
function TransferAssign({
  tx,
  accounts,
  locale,
  isDemo,
}: {
  tx: TransactionWithAccount;
  accounts: Account[];
  locale: string;
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creatingPocket, setCreatingPocket] = useState(false);

  const ref = tx.account_transfer;
  const others = accounts.filter((account) => account.id !== tx.account_id);

  function assign(value: string) {
    if (isDemo) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("transferAccountId", value);
    startTransition(async () => {
      const result = await assignTransactionTransferAccountAction(formData);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending || isDemo}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-normal transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
            ref ? "max-w-[190px] text-muted-foreground" : "px-2 text-muted-foreground/70",
          )}
          aria-label={t("transferAssignLabel")}
          title={t("transferAssignLabel")}
        >
          <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
          {ref ? (
            <span className="truncate">{transferLabel(ref, t)}</span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{t("transferAssignLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {others.map((account) => (
          <DropdownMenuCheckboxItem
            key={account.id}
            checked={
              Boolean(tx.transfer_manual) &&
              tx.transfer_account_id === account.id
            }
            onCheckedChange={() => assign(account.id)}
            className="cursor-pointer"
          >
            <span className="truncate">{account.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={Boolean(tx.transfer_manual) && !tx.transfer_account_id}
          onCheckedChange={() => assign("none")}
          className="cursor-pointer"
        >
          {t("transferAssignNone")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={!tx.transfer_manual}
          onCheckedChange={() => assign("auto")}
          className="cursor-pointer"
        >
          {t("transferAssignAuto")}
        </DropdownMenuCheckboxItem>
        {isDemo ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(event) => {
                // Le menu se referme avant que la boîte s'ouvre, sinon les deux
                // se disputent le focus.
                event.preventDefault();
                setCreatingPocket(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t("pocketCreateFromLabel")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>

      <CreatePocketDialog
        tx={tx}
        locale={locale}
        open={creatingPocket}
        onOpenChange={setCreatingPocket}
      />
    </DropdownMenu>
  );
}

/** Rattache une rentrée au salaire ou à une source suivie. */
function IncomeAssign({
  tx,
  incomeSources,
  payrollKeyword,
  isDemo,
}: {
  tx: TransactionWithAccount;
  incomeSources: ProfileTrackedIncomeSource[];
  payrollKeyword: string | null;
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const options = [
    { id: PAYROLL_INCOME_KEY, label: t("incomeSalary") },
    ...incomeSources.map((source) => ({ id: source.id, label: source.label })),
  ];

  const isManual = Boolean(tx.income_source);
  // Sans rattachement, on montre ce que la détection par mots-clés a trouvé.
  const detected = isPayrollTransfer(tx, payrollKeyword)
    ? PAYROLL_INCOME_KEY
    : (incomeSources.find((source) => isTrackedIncomeTransfer(tx, source))?.id ??
      null);
  const current = tx.income_source ?? detected;
  const label =
    options.find((option) => option.id === current)?.label ??
    t("incomeAssignPlaceholder");

  function assign(value: string) {
    if (isDemo) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", tx.id);
    formData.set("incomeSource", value);
    startTransition(async () => {
      const result = await assignTransactionIncomeSourceAction(formData);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending || isDemo}
          className="inline-flex h-8 max-w-[180px] cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-normal text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={t("incomeAssignLabel")}
        >
          <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("incomeAssignLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={isManual && tx.income_source === option.id}
            onCheckedChange={() => assign(option.id)}
            className="cursor-pointer"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={!isManual}
          onCheckedChange={() => assign("auto")}
          className="cursor-pointer"
        >
          {t("incomeAssignAuto")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TransactionExpenseType({
  tx,
  categories,
  savingsAccounts,
  peaInvestmentPlans,
  accounts,
  incomeSources,
  payrollKeyword,
  locale,
  compact,
  isDemo,
}: {
  tx: TransactionWithAccount;
  categories: Category[];
  savingsAccounts: SavingsAccount[];
  peaInvestmentPlans: PeaInvestmentPlan[];
  accounts: Account[];
  incomeSources: ProfileTrackedIncomeSource[];
  payrollKeyword: string | null;
  locale: string;
  compact: boolean;
  isDemo: boolean;
}) {
  const t = useTranslations("transactions");
  // Le rattachement manuel reste accessible sur toute ligne : les conversions
  // Revolut (« To EUR ») ne nomment aucun compte et échappent à la détection.
  const canAssignTransfer = !compact && !isDemo && accounts.length > 1;

  if (tx.savings_transfer) {
    const ref = tx.savings_transfer;
    const label =
      ref.direction === "deposit"
        ? t("savingsDepositTo", { name: ref.account_name })
        : t("savingsWithdrawalFrom", { name: ref.account_name });

    if (compact || savingsAccounts.length === 0) {
      return <SavingsTransferBadge label={label} />;
    }

    return (
      <SavingsAssign tx={tx} savingsAccounts={savingsAccounts} isDemo={isDemo} />
    );
  }

  if (tx.pea_transfer) {
    const ref = tx.pea_transfer;
    const label =
      ref.direction === "deposit"
        ? t("peaDepositTo", { name: ref.plan_label })
        : t("peaWithdrawalFrom", { name: ref.plan_label });

    if (compact || peaInvestmentPlans.length === 0) {
      return <SavingsTransferBadge label={label} />;
    }

    return (
      <PeaAssign
        tx={tx}
        peaInvestmentPlans={peaInvestmentPlans}
        isDemo={isDemo}
      />
    );
  }

  if (tx.account_transfer) {
    const label = transferLabel(tx.account_transfer, t);

    if (!canAssignTransfer) {
      return <SavingsTransferBadge label={label} />;
    }

    return (
      <TransferAssign
        tx={tx}
        accounts={accounts}
        locale={locale}
        isDemo={isDemo}
      />
    );
  }

  if (tx.amount >= 0) {
    if (compact || tx.amount === 0) {
      return <span className="text-muted-foreground">—</span>;
    }

    return (
      <div className="flex items-center gap-1.5">
        {canAssignTransfer ? (
          <TransferAssign
            tx={tx}
            accounts={accounts}
            locale={locale}
            isDemo={isDemo}
          />
        ) : null}
        <IncomeAssign
          tx={tx}
          incomeSources={incomeSources}
          payrollKeyword={payrollKeyword}
          isDemo={isDemo}
        />
      </div>
    );
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

  return (
    <div className="flex items-center gap-1.5">
      {canAssignTransfer ? (
        <TransferAssign
          tx={tx}
          accounts={accounts}
          locale={locale}
          isDemo={isDemo}
        />
      ) : null}
      <CategorySelect tx={tx} categories={categories} isDemo={isDemo} />
    </div>
  );
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
  savingsAccounts = [],
  peaInvestmentPlans = [],
  accounts = [],
  transferAccounts = [],
  incomeSources = [],
  payrollKeyword = null,
  recurringPayments = [],
  compact = false,
  isDemo = false,
}: TransactionsTableProps) {
  const t = useTranslations("transactions");
  const uniqueCategories = useMemo(
    () => dedupeCategories(categories),
    [categories],
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
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
    let deposits = 0;
    let withdrawals = 0;
    let recurring = 0;
    for (const tx of transactions) {
      if (
        selectedMonths.size > 0 &&
        !selectedMonths.has(tx.booking_date.slice(0, 7))
      ) {
        continue;
      }
      if (tx.recurring_payment_id) {
        recurring += 1;
      }
      if (tx.savings_transfer) {
        if (tx.savings_transfer.direction === "deposit") {
          deposits += 1;
        } else {
          withdrawals += 1;
        }
      } else if (tx.pea_transfer) {
        if (tx.pea_transfer.direction === "deposit") {
          deposits += 1;
        } else {
          withdrawals += 1;
        }
      }
      if (tx.category_id) {
        counts.set(tx.category_id, (counts.get(tx.category_id) ?? 0) + 1);
      } else if (
        tx.amount < 0 &&
        !tx.recurring_payment_id &&
        !isNeutralTransfer(tx)
      ) {
        uncategorized += 1;
      }
    }
    return { counts, uncategorized, deposits, withdrawals, recurring };
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
      if (accountFilter !== "all") {
        // Un compte manuel n'a pas de lignes à lui : ses mouvements vivent sur
        // le compte qui les a émis, et le désignent.
        const concerns =
          tx.account_id === accountFilter ||
          tx.account_transfer?.counterpart_account_id === accountFilter;
        if (!concerns) {
          return false;
        }
      }

      if (categoryFilter === "uncategorized") {
        return (
          tx.amount < 0 &&
          !tx.recurring_payment_id &&
          !tx.category_id &&
          !isNeutralTransfer(tx)
        );
      }
      if (categoryFilter === "recurring") {
        return Boolean(tx.recurring_payment_id);
      }
      if (categoryFilter === "deposits") {
        return (
          tx.savings_transfer?.direction === "deposit" ||
          tx.pea_transfer?.direction === "deposit"
        );
      }
      if (categoryFilter === "withdrawals") {
        return (
          tx.savings_transfer?.direction === "withdrawal" ||
          tx.pea_transfer?.direction === "withdrawal"
        );
      }
      if (categoryFilter !== "all") {
        return tx.category_id === categoryFilter;
      }
      return true;
    });
  }, [transactions, accountFilter, categoryFilter, selectedMonths, search]);

  // Chaque ligne monte deux popovers Radix : tout afficher d'un coup rendait
  // l'hydratation de la page proportionnelle à l'historique complet. On rend
  // donc par tranches, la tranche repartant de zéro à chaque changement de
  // filtre (comparaison de `filterKey` plutôt qu'un effet de synchronisation).
  const filterKey = `${accountFilter}|${categoryFilter}|${search}|${[...selectedMonths]
    .sort()
    .join(",")}`;
  const [pagination, setPagination] = useState({
    key: filterKey,
    count: PAGE_SIZE,
  });
  const visibleCount =
    pagination.key === filterKey ? pagination.count : PAGE_SIZE;
  const visible = useMemo(
    () => (filtered.length > visibleCount ? filtered.slice(0, visibleCount) : filtered),
    [filtered, visibleCount],
  );

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

  function canMarkSubscription(tx: TransactionWithAccount): boolean {
    return (
      !compact &&
      !isDemo &&
      tx.amount < 0 &&
      !tx.recurring_payment_id &&
      !isNeutralTransfer(tx)
    );
  }

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
      <>
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
          {visible.map((tx) => (
          <TableRow key={tx.id} className="group transition-colors duration-150">
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(tx.booking_date, locale)}
            </TableCell>
            <TableCell className="max-w-[200px] font-medium md:max-w-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="min-w-0 cursor-default truncate">
                      {tx.description}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    className="max-w-sm break-words"
                  >
                    {tx.description}
                  </TooltipContent>
                </Tooltip>
                {!compact ? (
                  <TransactionNote tx={tx} isDemo={isDemo} />
                ) : null}
                {canMarkSubscription(tx) ? (
                  <MarkAsSubscriptionDialog
                    tx={tx}
                    transactions={transactions}
                    subscriptions={recurringPayments}
                    locale={locale}
                  />
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
                savingsAccounts={savingsAccounts}
                peaInvestmentPlans={peaInvestmentPlans}
                accounts={
                  transferAccounts.length > 0 ? transferAccounts : accounts
                }
                incomeSources={incomeSources}
                payrollKeyword={payrollKeyword}
                locale={locale}
                compact={compact}
                isDemo={isDemo}
              />
            </TableCell>
          </TableRow>
        ))}
        </TableBody>
      </Table>

      {filtered.length > visible.length ? (
        <div className="flex flex-col items-center gap-2 pt-4">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("shownCount", {
              shown: visible.length,
              total: filtered.length,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() =>
              setPagination({
                key: filterKey,
                count: visible.length + PAGE_SIZE,
              })
            }
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
      </>
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

      {accounts.length > 1 ? (
        <div
          className="flex w-full flex-wrap gap-1 rounded-lg border border-border p-1"
          role="tablist"
          aria-label={t("accountTabsLabel")}
        >
          {[{ id: "all", name: t("accountTabAll") }, ...accounts].map(
            (account) => (
              <Button
                key={account.id}
                type="button"
                size="sm"
                role="tab"
                aria-selected={accountFilter === account.id}
                variant={accountFilter === account.id ? "default" : "ghost"}
                className="h-8 max-w-[14rem] cursor-pointer px-3 text-xs"
                onClick={() => setAccountFilter(account.id)}
              >
                <span className="truncate">{account.name}</span>
              </Button>
            ),
          )}
        </div>
      ) : null}

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
                <SelectItem
                  value="recurring"
                  className={cn(
                    "cursor-pointer",
                    categoryCounts.recurring === 0 && "text-muted-foreground/60",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span>{t("filterRecurring")}</span>
                    <span className="ml-auto pr-1 text-xs tabular-nums text-muted-foreground">
                      {categoryCounts.recurring}
                    </span>
                  </span>
                </SelectItem>
                <SelectItem
                  value="deposits"
                  className={cn(
                    "cursor-pointer",
                    categoryCounts.deposits === 0 && "text-muted-foreground/60",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span>{t("filterDeposits")}</span>
                    <span className="ml-auto pr-1 text-xs tabular-nums text-muted-foreground">
                      {categoryCounts.deposits}
                    </span>
                  </span>
                </SelectItem>
                <SelectItem
                  value="withdrawals"
                  className={cn(
                    "cursor-pointer",
                    categoryCounts.withdrawals === 0 && "text-muted-foreground/60",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span>{t("filterWithdrawals")}</span>
                    <span className="ml-auto pr-1 text-xs tabular-nums text-muted-foreground">
                      {categoryCounts.withdrawals}
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
