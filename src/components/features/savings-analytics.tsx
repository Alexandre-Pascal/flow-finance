/**
 * @file savings-analytics.tsx
 * @description Page Épargne : comptes définis par l'utilisateur, soldes
 * reconstruits depuis les virements, évolution et gestion (CRUD).
 */

"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createSavingsAccountAction,
  createSavingsAdjustmentAction,
  deleteSavingsAccountAction,
  deleteSavingsAdjustmentAction,
  updateSavingsAccountAction,
  type SavingsActionError,
} from "@/app/actions/savings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import { type MonthlyPeriod } from "@/lib/finance/aggregates";
import { CATEGORY_COLOR_PALETTE, normalizeColor } from "@/lib/finance/expense-categories";
import {
  SAVINGS_ADJUSTMENT_KINDS,
  SAVINGS_KINDS,
  SAVINGS_KIND_COLORS,
  buildChartSeriesForPeriod,
  type CheckingVehicle,
  type SavingsChartPoint,
  type SavingsMovementSource,
  type SavingsOverview,
  type SavingsVehicle,
} from "@/lib/finance/savings";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SavingsAccount, SavingsAccountKind, SavingsAdjustmentKind } from "@/types/database";

interface SavingsAnalyticsProps {
  overview: SavingsOverview;
  checking: CheckingVehicle[];
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
  showConnectBank: boolean;
  bankConfigured: boolean;
}

const CHECKING_COLOR = "#2563EB";

function formatCompactCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function SavingsAnalytics({
  overview,
  checking,
  locale,
  isDemo,
  schemaReady,
  showConnectBank,
  bankConfigured,
}: SavingsAnalyticsProps) {
  const t = useTranslations("savings");
  const router = useRouter();
  const [period, setPeriod] = useState<MonthlyPeriod>(12);
  const [formState, setFormState] = useState<
    { mode: "create" } | { mode: "edit"; account: SavingsAccount } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<SavingsAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalBalance = useMemo(
    () =>
      overview.totalBalance +
      checking.reduce((sum, vehicle) => sum + vehicle.balance, 0),
    [overview.totalBalance, checking],
  );

  const checkingTotals = useMemo(
    () =>
      checking.reduce(
        (acc, vehicle) => {
          for (const month of vehicle.monthly) {
            acc.deposits += month.deposits;
            acc.withdrawals += month.withdrawals;
          }
          return acc;
        },
        { deposits: 0, withdrawals: 0 },
      ),
    [checking],
  );

  const totalDeposits = useMemo(
    () =>
      overview.vehicles.reduce((sum, v) => sum + v.totalDeposits, 0) +
      checkingTotals.deposits,
    [overview.vehicles, checkingTotals.deposits],
  );
  const totalWithdrawals = useMemo(
    () =>
      overview.vehicles.reduce((sum, v) => sum + v.totalWithdrawals, 0) +
      checkingTotals.withdrawals,
    [overview.vehicles, checkingTotals.withdrawals],
  );

  function translateError(actionError: SavingsActionError): string {
    switch (actionError) {
      case "demo":
        return t("demoError");
      case "schema":
        return t("schemaError");
      case "invalid":
        return t("invalidError");
      default:
        return t("saveError");
    }
  }

  function handleSubmit(formData: FormData, mode: "create" | "edit") {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createSavingsAccountAction(formData)
          : await updateSavingsAccountAction(formData);
      if (result.error) {
        setError(translateError(result.error));
        return;
      }
      setFormState(null);
      router.refresh();
    });
  }

  function handleDelete(account: SavingsAccount) {
    setError(null);
    const formData = new FormData();
    formData.set("id", account.id);
    startTransition(async () => {
      const result = await deleteSavingsAccountAction(formData);
      setConfirmDelete(null);
      if (result.error) {
        setError(translateError(result.error));
        return;
      }
      router.refresh();
    });
  }

  const hasAccounts = overview.vehicles.length > 0;
  const hasAnyChart = hasAccounts || checking.length > 0;

  return (
    <div className="space-y-6">
      {!schemaReady ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {t("schemaError")}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* KPI summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<Wallet className="size-5" aria-hidden />}
          label={t("totalBalance")}
          value={formatCurrency(totalBalance, locale)}
          accent
        />
        <KpiCard
          icon={<ArrowUpRight className="size-5" aria-hidden />}
          label={t("totalDeposits")}
          value={formatCurrency(totalDeposits, locale)}
        />
        <KpiCard
          icon={<ArrowDownLeft className="size-5" aria-hidden />}
          label={t("totalWithdrawals")}
          value={formatCurrency(totalWithdrawals, locale)}
        />
      </div>

      {hasAnyChart ? (
        <div className="flex justify-end">
          <Tabs
            value={String(period)}
            onValueChange={(value) =>
              setPeriod(value === "all" ? "all" : (Number(value) as MonthlyPeriod))
            }
          >
            <TabsList>
              <TabsTrigger value="1" className="cursor-pointer">
                {t("periodThis")}
              </TabsTrigger>
              <TabsTrigger value="3" className="cursor-pointer">
                {t("period3")}
              </TabsTrigger>
              <TabsTrigger value="6" className="cursor-pointer">
                {t("period6")}
              </TabsTrigger>
              <TabsTrigger value="12" className="cursor-pointer">
                {t("period12")}
              </TabsTrigger>
              <TabsTrigger value="all" className="cursor-pointer">
                {t("periodAll")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      {/* Compte courant */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
          {t("checkingTitle")}
        </div>
        {checking.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {checking.map((vehicle) => (
              <CheckingCard
                key={vehicle.account.id}
                vehicle={vehicle}
                period={period}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <ConnectBankCard
            configured={bankConfigured}
            canConnect={showConnectBank}
          />
        )}
      </section>

      {/* Comptes d'épargne */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PiggyBank className="size-4 text-muted-foreground" aria-hidden />
            {t("savingsTitle")}
            <span className="text-muted-foreground">
              · {t("accountCount", { count: overview.vehicles.length })}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            disabled={isDemo || !schemaReady}
            onClick={() => {
              setError(null);
              setFormState({ mode: "create" });
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t("addAccount")}
          </Button>
        </div>

        {!hasAccounts ? (
          <EmptyState
            disabled={isDemo || !schemaReady}
            onAdd={() => {
              setError(null);
              setFormState({ mode: "create" });
            }}
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {overview.vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.account.id}
                vehicle={vehicle}
                period={period}
                locale={locale}
                isDemo={isDemo}
                isPending={isPending}
                onEdit={() => {
                  setError(null);
                  setFormState({ mode: "edit", account: vehicle.account });
                }}
                onDelete={() => setConfirmDelete(vehicle.account)}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={formState !== null}
        onOpenChange={(open) => {
          if (!open) setFormState(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {formState ? (
            <SavingsAccountForm
              mode={formState.mode}
              account={formState.mode === "edit" ? formState.account : undefined}
              isPending={isPending}
              onSubmit={handleSubmit}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDescription", { name: confirmDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="cursor-pointer"
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="cursor-pointer"
              disabled={isPending}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={cn(accent && "border-primary/30 bg-primary/5")}>
      <CardContent className="flex items-center gap-4 py-5">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            accent
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  onAdd,
  disabled,
}: {
  onAdd: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("savings");
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <PiggyBank className="size-7" aria-hidden />
        </div>
        <div className="max-w-md space-y-1.5">
          <p className="text-base font-medium text-foreground">
            {t("emptyTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
        </div>
        <Button
          type="button"
          className="cursor-pointer"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus className="size-4" aria-hidden />
          {t("addFirstAccount")}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ChartTooltipPayloadItem {
  value?: number;
  payload?: SavingsChartPoint;
}

function BalanceTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: readonly ChartTooltipPayloadItem[];
  locale: string;
}) {
  const tt = useTranslations("savings");
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const item = payload[0];
  const point = item.payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{point?.labelFull ?? ""}</p>
      <p className="mt-0.5 text-muted-foreground">
        {tt("balance")} : {formatCurrency(item.value ?? 0, locale)}
      </p>
    </div>
  );
}

function BalanceChart({
  data,
  color,
  gradientId,
  locale,
  compactAxis,
}: {
  data: SavingsChartPoint[];
  color: string;
  gradientId: string;
  locale: string;
  compactAxis: boolean;
}) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            interval={compactAxis ? "preserveStartEnd" : undefined}
            minTickGap={compactAxis ? 28 : undefined}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => formatCompactCurrency(value, locale)}
            className="text-muted-foreground"
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            content={({ active, payload }) => (
              <BalanceTooltip
                active={active}
                payload={payload as readonly ChartTooltipPayloadItem[]}
                locale={locale}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function movementDefaultLabel(
  source: SavingsMovementSource,
  t: ReturnType<typeof useTranslations<"savings">>,
): string {
  switch (source) {
    case "cash":
      return t("movementCash");
    case "check":
      return t("movementCheck");
    case "interest":
      return t("movementInterest");
    default:
      return t("movementTransfer");
  }
}

function SavingsAdjustmentDialog({
  account,
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  account: SavingsAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const t = useTranslations("savings");
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<SavingsAdjustmentKind>("cash");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("savingsAccountId", account.id);
            formData.set("kind", kind);
            onSubmit(formData);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("adjustmentFormTitle")}</DialogTitle>
            <DialogDescription>
              {t("adjustmentFormDescription", { name: account.name })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`adj-kind-${account.id}`}>{t("adjustmentKindLabel")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as SavingsAdjustmentKind)}>
                <SelectTrigger id={`adj-kind-${account.id}`} className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAVINGS_ADJUSTMENT_KINDS.map((value) => (
                    <SelectItem key={value} value={value} className="cursor-pointer">
                      {t(`adjustmentKind_${value}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`adj-amount-${account.id}`}>{t("adjustmentAmountLabel")}</Label>
                <Input
                  id={`adj-amount-${account.id}`}
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`adj-date-${account.id}`}>{t("adjustmentDateLabel")}</Label>
                <Input
                  id={`adj-date-${account.id}`}
                  name="adjustmentDate"
                  type="date"
                  defaultValue={today}
                  disabled={isPending}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`adj-note-${account.id}`}>{t("adjustmentNoteLabel")}</Label>
              <Input
                id={`adj-note-${account.id}`}
                name="note"
                placeholder={t("adjustmentNotePlaceholder")}
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="cursor-pointer" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" className="cursor-pointer" disabled={isPending}>
              {t("adjustmentSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VehicleCard({
  vehicle,
  period,
  locale,
  isDemo,
  isPending,
  onEdit,
  onDelete,
}: {
  vehicle: SavingsVehicle;
  period: MonthlyPeriod;
  locale: string;
  isDemo: boolean;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("savings");
  const router = useRouter();
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [movementPending, startMovementTransition] = useTransition();
  const pending = isPending || movementPending;
  const { account } = vehicle;
  const chartData = useMemo(
    () =>
      buildChartSeriesForPeriod(
        vehicle.monthly,
        vehicle.movements,
        vehicle.balance,
        locale,
        period,
      ),
    [vehicle.monthly, vehicle.movements, vehicle.balance, locale, period],
  );
  const periodStats = useMemo(
    () =>
      chartData.reduce(
        (acc, point) => ({
          deposits: acc.deposits + point.deposits,
          withdrawals: acc.withdrawals + point.withdrawals,
        }),
        { deposits: 0, withdrawals: 0 },
      ),
    [chartData],
  );
  const gradientId = `savings-grad-${account.id}`;

  const ceilingPct =
    account.ceiling && account.ceiling > 0
      ? Math.min(100, Math.round((vehicle.balance / account.ceiling) * 100))
      : null;

  function handleCreateAdjustment(formData: FormData) {
    startMovementTransition(async () => {
      const result = await createSavingsAdjustmentAction(formData);
      if (!result.error) {
        setAdjustmentOpen(false);
        router.refresh();
      }
    });
  }

  function handleDeleteAdjustment(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    startMovementTransition(async () => {
      await deleteSavingsAdjustmentAction(formData);
      router.refresh();
    });
  }

  return (
    <Card className="group overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: account.color }}
              aria-hidden
            />
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{account.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t(`kind_${account.kind}` as never)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              disabled={isPending || isDemo}
              onClick={onEdit}
              aria-label={t("edit")}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-muted-foreground hover:text-destructive"
              disabled={isPending || isDemo}
              onClick={onDelete}
              aria-label={t("delete")}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(vehicle.balance, locale)}
            </p>
            <p className="text-xs text-muted-foreground">{t("currentBalance")}</p>
          </div>
          {account.interest_rate != null ? (
            <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <TrendingUp className="size-3.5" aria-hidden />
              {new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(account.interest_rate)}{" "}
              %
            </div>
          ) : null}
        </div>

        {ceilingPct != null ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("ceilingLabel")}</span>
              <span className="tabular-nums">
                {formatCompactCurrency(vehicle.balance, locale)} /{" "}
                {formatCompactCurrency(account.ceiling ?? 0, locale)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${ceilingPct}%`,
                  backgroundColor: account.color,
                }}
              />
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        <BalanceChart
          data={chartData}
          color={account.color}
          gradientId={gradientId}
          locale={locale}
          compactAxis={period === 1 || period === 3}
        />

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label={t("totalDeposits")}
            value={formatCurrency(periodStats.deposits, locale)}
            positive
          />
          <Stat
            label={t("totalWithdrawals")}
            value={formatCurrency(periodStats.withdrawals, locale)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("recentMovements")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 cursor-pointer gap-1 px-2 text-xs"
              disabled={isDemo || pending}
              onClick={() => setAdjustmentOpen(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              {t("addAdjustment")}
            </Button>
          </div>
          {vehicle.movements.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              {t("noMovements")}
            </p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {vehicle.movements.map((movement) => (
                <li
                  key={movement.id}
                  className="group/movement flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    {movement.label.trim() ? (
                      <>
                        <p className="truncate text-foreground">{movement.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(movement.date, locale)}
                          {movement.source !== "transfer" ? (
                            <span className="ml-1.5">
                              · {movementDefaultLabel(movement.source, t)}
                            </span>
                          ) : null}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="truncate text-foreground">
                          {movementDefaultLabel(movement.source, t)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(movement.date, locale)}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        "tabular-nums",
                        movement.source === "interest"
                          ? "text-amber-600 dark:text-amber-400"
                          : movement.amount >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-foreground",
                      )}
                    >
                      {movement.amount >= 0 ? "+" : ""}
                      {formatCurrency(movement.amount, locale)}
                    </span>
                    {movement.source !== "transfer" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 cursor-pointer text-muted-foreground opacity-0 hover:text-destructive group-hover/movement:opacity-100"
                        disabled={isDemo || pending}
                        aria-label={t("deleteAdjustment")}
                        onClick={() => handleDeleteAdjustment(movement.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <SavingsAdjustmentDialog
        account={account}
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        isPending={pending}
        onSubmit={handleCreateAdjustment}
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          positive && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CheckingCard({
  vehicle,
  period,
  locale,
}: {
  vehicle: CheckingVehicle;
  period: MonthlyPeriod;
  locale: string;
}) {
  const t = useTranslations("savings");
  const { account } = vehicle;
  const chartData = useMemo(
    () =>
      buildChartSeriesForPeriod(
        vehicle.monthly,
        vehicle.movements,
        vehicle.balance,
        locale,
        period,
      ),
    [vehicle.monthly, vehicle.movements, vehicle.balance, locale, period],
  );
  const periodStats = useMemo(
    () =>
      chartData.reduce(
        (acc, point) => ({
          income: acc.income + point.deposits,
          expenses: acc.expenses + point.withdrawals,
        }),
        { income: 0, expenses: 0 },
      ),
    [chartData],
  );
  const gradientId = `checking-grad-${account.id}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Landmark className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{account.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("checkingLabel")}</p>
          </div>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrency(vehicle.balance, locale)}
          </p>
          <p className="text-xs text-muted-foreground">{t("currentBalance")}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <BalanceChart
          data={chartData}
          color={CHECKING_COLOR}
          gradientId={gradientId}
          locale={locale}
          compactAxis={period === 1 || period === 3}
        />

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label={t("income")}
            value={formatCurrency(periodStats.income, locale)}
            positive
          />
          <Stat
            label={t("expenses")}
            value={formatCurrency(periodStats.expenses, locale)}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("recentMovements")}
          </p>
          {vehicle.movements.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              {t("noMovements")}
            </p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {vehicle.movements.slice(0, 15).map((movement) => (
                <li
                  key={movement.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{movement.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(movement.date, locale)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      movement.amount >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    {movement.amount >= 0 ? "+" : ""}
                    {formatCurrency(movement.amount, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectBankCard({
  configured,
  canConnect,
}: {
  configured: boolean;
  canConnect: boolean;
}) {
  const t = useTranslations("savings");
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Building2 className="size-6" aria-hidden />
        </div>
        <div className="max-w-md space-y-1.5">
          <p className="text-base font-medium text-foreground">
            {t("noCheckingTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {configured ? t("noCheckingDescription") : t("connectBankSoon")}
          </p>
        </div>
        {configured ? (
          <form action="/api/bank/connect" method="get">
            <Button
              type="submit"
              disabled={!canConnect}
              className="cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {t("connectBank")}
            </Button>
          </form>
        ) : (
          <Button
            disabled
            className="cursor-not-allowed bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("connectBank")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SavingsAccountForm({
  mode,
  account,
  isPending,
  onSubmit,
}: {
  mode: "create" | "edit";
  account?: SavingsAccount;
  isPending: boolean;
  onSubmit: (formData: FormData, mode: "create" | "edit") => void;
}) {
  const t = useTranslations("savings");
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<SavingsAccountKind>(account?.kind ?? "livret_a");
  const [color, setColor] = useState(
    account?.color ?? SAVINGS_KIND_COLORS[account?.kind ?? "livret_a"],
  );

  function handleKindChange(value: string) {
    const next = value as SavingsAccountKind;
    setKind(next);
    if (!account) {
      setColor(SAVINGS_KIND_COLORS[next]);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("kind", kind);
        formData.set("color", color);
        if (account) {
          formData.set("id", account.id);
        }
        onSubmit(formData, mode);
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {mode === "create" ? t("formCreateTitle") : t("formEditTitle")}
        </DialogTitle>
        <DialogDescription>{t("formDescription")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="savings-name">{t("nameLabel")}</Label>
            <Input
              id="savings-name"
              name="name"
              defaultValue={account?.name ?? ""}
              placeholder={t("namePlaceholder")}
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="savings-kind">{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={handleKindChange}>
              <SelectTrigger id="savings-kind" className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAVINGS_KINDS.map((value) => (
                  <SelectItem key={value} value={value} className="cursor-pointer">
                    {t(`kind_${value}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("colorLabel")}</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {CATEGORY_COLOR_PALETTE.map((paletteColor) => {
              const isSelected =
                normalizeColor(color) === normalizeColor(paletteColor);
              return (
                <button
                  key={paletteColor}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={paletteColor}
                  onClick={() => setColor(paletteColor)}
                  disabled={isPending}
                  className={cn(
                    "size-7 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-background transition hover:scale-110",
                    isSelected ? "ring-foreground" : "ring-transparent",
                  )}
                  style={{ backgroundColor: paletteColor }}
                />
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="savings-base-balance">{t("baseBalanceLabel")}</Label>
            <Input
              id="savings-base-balance"
              name="baseBalance"
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={account?.base_balance ?? ""}
              placeholder="0,00"
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="savings-base-date">{t("baseDateLabel")}</Label>
            <Input
              id="savings-base-date"
              name="baseDate"
              type="date"
              defaultValue={account?.base_date ?? today}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="savings-rate">{t("rateLabel")}</Label>
            <Input
              id="savings-rate"
              name="interestRate"
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={account?.interest_rate ?? ""}
              placeholder="2,40"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="savings-ceiling">{t("ceilingFieldLabel")}</Label>
            <Input
              id="savings-ceiling"
              name="ceiling"
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={account?.ceiling ?? ""}
              placeholder="22950"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="savings-deposit-keywords">{t("depositKeywordsLabel")}</Label>
          <Input
            id="savings-deposit-keywords"
            name="depositKeywords"
            defaultValue={account?.deposit_keywords.join(", ") ?? ""}
            placeholder={t("depositKeywordsPlaceholder")}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">{t("depositKeywordsHint")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="savings-withdrawal-keywords">
            {t("withdrawalKeywordsLabel")}
          </Label>
          <Input
            id="savings-withdrawal-keywords"
            name="withdrawalKeywords"
            defaultValue={account?.withdrawal_keywords.join(", ") ?? ""}
            placeholder={t("withdrawalKeywordsPlaceholder")}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            {t("withdrawalKeywordsHint")}
          </p>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer"
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" className="cursor-pointer" disabled={isPending}>
          {mode === "create" ? t("createButton") : t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
