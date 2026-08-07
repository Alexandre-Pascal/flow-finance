/**
 * @file pea-portfolio.tsx
 * @description Portefeuille PEA : positions, plans d'investissement détectés au
 * libellé bancaire, import de l'export Trade Republic et fiscalité des 5 ans.
 */

"use client";

import {
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import {
  clearPeaCsvImportAction,
  createPeaHoldingAction,
  createPeaPlanAction,
  createPeaTransactionAction,
  deletePeaHoldingAction,
  deletePeaPlanAction,
  deletePeaTransactionAction,
  importPeaFileAction,
  syncPeaBankTransfersAction,
  updatePeaHoldingAction,
  updatePeaPlanAction,
  updatePeaSettingsAction,
  type PeaActionError,
} from "@/app/actions/pea";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PeaHoldingView, PeaPortfolioSummary } from "@/lib/pea/valuation";
import type {
  PeaInvestmentPlan,
  PeaSettings,
  PeaTransaction,
  PeaTransactionKind,
} from "@/types/database";

const TRANSACTION_KINDS: PeaTransactionKind[] = [
  "buy",
  "sell",
  "dividend",
  "deposit",
  "withdrawal",
  "fee",
  "interest",
];

interface PeaPortfolioProps {
  holdings: PeaHoldingView[];
  transactions: PeaTransaction[];
  plans: PeaInvestmentPlan[];
  settings: PeaSettings;
  summary: PeaPortfolioSummary;
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
}

function errorMessage(
  t: ReturnType<typeof useTranslations>,
  error?: PeaActionError,
) {
  if (!error) return null;
  return t(`error_${error}` as never);
}

export function PeaPortfolio({
  holdings,
  transactions,
  plans,
  settings,
  summary,
  locale,
  isDemo,
  schemaReady,
}: PeaPortfolioProps) {
  const t = useTranslations("pea");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [holdingDialog, setHoldingDialog] = useState<
    { mode: "create" } | { mode: "edit"; holding: PeaHoldingView } | null
  >(null);
  const [planDialog, setPlanDialog] = useState<
    { mode: "create" } | { mode: "edit"; plan: PeaInvestmentPlan } | null
  >(null);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [clearCsvOpen, setClearCsvOpen] = useState(false);
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [selectedKind, setSelectedKind] = useState<PeaTransactionKind>("buy");
  const csvTransactionCount = transactions.filter((tx) => tx.source === "csv").length;

  function run(
    action: () => Promise<{ error?: PeaActionError }>,
    onSuccess?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(errorMessage(t, result.error));
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true);
    setError(null);
    try {
      const response = await fetch("/api/pea/prices");
      if (!response.ok) {
        throw new Error("refresh failed");
      }
      router.refresh();
    } catch {
      setError(t("error_prices"));
    } finally {
      setRefreshingPrices(false);
    }
  }

  if (!schemaReady) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("error_schema")}
        </CardContent>
      </Card>
    );
  }

  const needsHoldingForTx = selectedKind === "buy" || selectedKind === "sell";

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={t("kpiCurrentValue")}
          value={formatCurrency(summary.currentValueEur, locale)}
        />
        <KpiCard
          label={t("kpiDeposited")}
          value={formatCurrency(summary.totalDepositedEur, locale)}
        />
        <KpiCard
          label={t("kpiLatentGain")}
          value={formatCurrency(summary.latentGainEur, locale)}
        />
        <KpiCard
          label={t("kpiTax")}
          value={formatCurrency(summary.taxEur, locale)}
          hint={t(summary.isMatured ? "taxMatured" : "taxNotMatured", {
            rate: Math.round(summary.taxRate * 1000) / 10,
          })}
        />
        <KpiCard
          label={t("kpiNetIfSold")}
          value={formatCurrency(summary.netIfSoldTodayEur, locale)}
          highlight
        />
      </div>

      {summary.hasEstimates ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {t("estimateNotice")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settingsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              run(() => updatePeaSettingsAction(formData));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="pea-opening-date">{t("openingDateLabel")}</Label>
              <Input
                id="pea-opening-date"
                name="openingDate"
                type="date"
                defaultValue={settings.opening_date ?? ""}
                disabled={isPending || isDemo}
              />
              <p className="text-xs text-muted-foreground">
                {summary.maturityDate
                  ? t("maturityHint", {
                      date: formatDate(summary.maturityDate, locale),
                    })
                  : t("openingDateHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pea-cash-balance">{t("cashBalanceLabel")}</Label>
              <Input
                id="pea-cash-balance"
                name="cashBalance"
                type="number"
                step="0.01"
                min="0"
                defaultValue={settings.cash_balance_eur}
                disabled={isPending || isDemo}
              />
              <p className="text-xs text-muted-foreground">{t("cashBalanceHint")}</p>
            </div>
            <Button
              type="submit"
              variant="outline"
              className="cursor-pointer"
              disabled={isPending || isDemo}
            >
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            run(() => importPeaFileAction(formData), () => {
              if (fileRef.current) {
                fileRef.current.value = "";
              }
            });
          }}
        >
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            id="pea-import-file"
            disabled={isPending || isDemo}
            onChange={(event) => {
              const form = event.currentTarget.form;
              if (form && event.currentTarget.files?.length) {
                form.requestSubmit();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={isPending || isDemo}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {t("importFile")}
          </Button>
        </form>

        {csvTransactionCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending || isDemo}
            onClick={() => setClearCsvOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            {t("clearCsvImport")}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={isPending || isDemo}
          onClick={() => setHoldingDialog({ mode: "create" })}
        >
          <Plus className="size-4" aria-hidden />
          {t("addHolding")}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={isPending || isDemo}
          onClick={() => {
            setSelectedHoldingId(holdings[0]?.id ?? "");
            setSelectedKind("buy");
            setTxDialogOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          {t("addTransaction")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          disabled={isPending || isDemo || plans.length === 0}
          onClick={() => run(() => syncPeaBankTransfersAction())}
        >
          <Repeat className="size-4" aria-hidden />
          {t("syncTransfers")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          disabled={refreshingPrices || holdings.length === 0}
          onClick={handleRefreshPrices}
        >
          <RefreshCw
            className={`size-4 ${refreshingPrices ? "animate-spin" : ""}`}
            aria-hidden
          />
          {refreshingPrices ? t("refreshingPrices") : t("refreshPrices")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("plansTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("plansHint")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={isPending || isDemo}
            onClick={() => setPlanDialog({ mode: "create" })}
          >
            <Plus className="size-4" aria-hidden />
            {t("addPlan")}
          </Button>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("plansEmpty")}</p>
              <Button
                type="button"
                className="cursor-pointer"
                disabled={isPending || isDemo}
                onClick={() => setPlanDialog({ mode: "create" })}
              >
                <Plus className="size-4" aria-hidden />
                {t("addPlan")}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {plans.map((plan) => {
                const holding = holdings.find((item) => item.id === plan.holding_id);
                return (
                  <li
                    key={plan.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{plan.label}</span>
                        {plan.active ? (
                          <Badge>{t("planActiveBadge")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("planInactive")}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("planSummary", {
                          keywords: plan.keywords.join(", "),
                          etf: holding?.name ?? t("planEtfMissing"),
                          amount: plan.expected_amount_eur
                            ? formatCurrency(plan.expected_amount_eur, locale)
                            : "—",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer text-muted-foreground"
                        disabled={isPending || isDemo}
                        onClick={() => setPlanDialog({ mode: "edit", plan })}
                        aria-label={t("editPlan")}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer text-muted-foreground hover:text-destructive"
                        disabled={isPending || isDemo}
                        onClick={() => {
                          const formData = new FormData();
                          formData.set("id", plan.id);
                          run(() => deletePeaPlanAction(formData));
                        }}
                        aria-label={t("deletePlan")}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {holdings.length === 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <LineChart className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-base">{t("emptyTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("emptyDescription")}
              </p>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("holdingsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colIsin")}</TableHead>
                  <TableHead className="text-right">{t("colQuantity")}</TableHead>
                  <TableHead className="text-right">{t("colPrice")}</TableHead>
                  <TableHead className="text-right">{t("colValue")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => (
                  <TableRow key={holding.id}>
                    <TableCell>
                      <div className="font-medium">{holding.name}</div>
                      {holding.resolvedTicker ? (
                        <div className="text-xs text-muted-foreground">
                          {holding.resolvedTicker}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          {t("missingTicker")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{holding.isin}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        {holding.quantity}
                        {holding.hasEstimatedQuantity ? (
                          <Badge variant="outline">{t("estimated")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {holding.priceEur != null
                        ? formatCurrency(holding.priceEur, locale)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {holding.currentValueEur != null
                        ? formatCurrency(holding.currentValueEur, locale)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="cursor-pointer text-muted-foreground"
                          disabled={isPending || isDemo}
                          onClick={() => setHoldingDialog({ mode: "edit", holding })}
                          aria-label={t("editHolding")}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="cursor-pointer text-muted-foreground hover:text-destructive"
                          disabled={isPending || isDemo}
                          onClick={() => {
                            const formData = new FormData();
                            formData.set("id", holding.id);
                            run(() => deletePeaHoldingAction(formData));
                          }}
                          aria-label={t("deleteHolding")}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {transactions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("transactionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colDate")}</TableHead>
                  <TableHead>{t("colKind")}</TableHead>
                  <TableHead className="text-right">{t("colQuantity")}</TableHead>
                  <TableHead className="text-right">{t("colAmountEur")}</TableHead>
                  <TableHead>{t("colSource")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const holding = holdings.find((item) => item.id === tx.holding_id);
                  return (
                    <TableRow key={tx.id}>
                      <TableCell>{formatDate(tx.transaction_date, locale)}</TableCell>
                      <TableCell>
                        {t(`kind_${tx.kind}` as never)}
                        {holding ? ` · ${holding.name}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {tx.quantity || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(tx.amount_eur, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.source === "bank_estimate" ? "outline" : "ghost"}
                        >
                          {t(`source_${tx.source}` as never)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="cursor-pointer"
                          disabled={isPending || isDemo}
                          aria-label={t("deleteTransaction")}
                          onClick={() => {
                            const formData = new FormData();
                            formData.set("id", tx.id);
                            run(() => deletePeaTransactionAction(formData));
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={holdingDialog != null}
        onOpenChange={(open) => {
          if (!open) setHoldingDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {holdingDialog?.mode === "edit"
                ? t("editHoldingTitle")
                : t("addHoldingTitle")}
            </DialogTitle>
            <DialogDescription>{t("holdingFormDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const isEdit = holdingDialog?.mode === "edit";
              run(
                () =>
                  isEdit
                    ? updatePeaHoldingAction(formData)
                    : createPeaHoldingAction(formData),
                () => setHoldingDialog(null),
              );
            }}
          >
            {holdingDialog?.mode === "edit" ? (
              <input type="hidden" name="id" value={holdingDialog.holding.id} />
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="pea-holding-name">{t("colName")}</Label>
              <Input
                id="pea-holding-name"
                name="name"
                defaultValue={
                  holdingDialog?.mode === "edit" ? holdingDialog.holding.name : ""
                }
                required
                disabled={isPending}
              />
            </div>

            {holdingDialog?.mode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="pea-holding-isin">{t("colIsin")}</Label>
                <Input
                  id="pea-holding-isin"
                  name="isin"
                  placeholder="IE00B4L5Y983"
                  required
                  disabled={isPending}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="pea-holding-ticker">{t("tickerLabel")}</Label>
              <Input
                id="pea-holding-ticker"
                name="ticker"
                placeholder="CW8.PA"
                defaultValue={
                  holdingDialog?.mode === "edit"
                    ? (holdingDialog.holding.ticker ?? "")
                    : ""
                }
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">{t("tickerHint")}</p>
            </div>

            {holdingDialog?.mode === "edit" ? (
              <div className="space-y-2">
                <Label htmlFor="pea-holding-price">{t("manualPriceLabel")}</Label>
                <Input
                  id="pea-holding-price"
                  name="manualPrice"
                  type="number"
                  step="0.0001"
                  min="0"
                  defaultValue={holdingDialog.holding.manual_price_eur ?? ""}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">{t("manualPriceHint")}</p>
              </div>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" className="cursor-pointer" disabled={isPending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={planDialog != null}
        onOpenChange={(open) => {
          if (!open) setPlanDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {planDialog?.mode === "edit" ? t("editPlanTitle") : t("addPlanTitle")}
            </DialogTitle>
            <DialogDescription>{t("planFormDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const isEdit = planDialog?.mode === "edit";
              run(
                () =>
                  isEdit ? updatePeaPlanAction(formData) : createPeaPlanAction(formData),
                () => setPlanDialog(null),
              );
            }}
          >
            {planDialog?.mode === "edit" ? (
              <>
                <input type="hidden" name="id" value={planDialog.plan.id} />
                <input
                  type="hidden"
                  name="holdingId"
                  value={planDialog.plan.holding_id ?? ""}
                />
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="pea-plan-label">{t("planLabelField")}</Label>
              <Input
                id="pea-plan-label"
                name="label"
                defaultValue={
                  planDialog?.mode === "edit"
                    ? planDialog.plan.label
                    : "DCA ETF monde"
                }
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pea-plan-keywords">{t("planKeywordsLabel")}</Label>
              <Input
                id="pea-plan-keywords"
                name="keywords"
                placeholder="200 euros ETF monde"
                defaultValue={
                  planDialog?.mode === "edit"
                    ? planDialog.plan.keywords.join(", ")
                    : "200 euros ETF monde"
                }
                required
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">{t("planKeywordsHint")}</p>
            </div>

            {(() => {
              const editingHolding =
                planDialog?.mode === "edit"
                  ? holdings.find((item) => item.id === planDialog.plan.holding_id)
                  : null;
              return (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pea-plan-etf-name">{t("planEtfNameLabel")}</Label>
                    <Input
                      id="pea-plan-etf-name"
                      name="etfName"
                      placeholder="MSCI World Swap PEA"
                      defaultValue={
                        editingHolding?.name ?? "MSCI World Swap PEA EUR (Acc)"
                      }
                      required
                      disabled={isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pea-plan-isin">{t("planIsinLabel")}</Label>
                    <Input
                      id="pea-plan-isin"
                      name="isin"
                      placeholder="IE0002XZSHO1"
                      defaultValue={editingHolding?.isin ?? "IE0002XZSHO1"}
                      required
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground">{t("planIsinHint")}</p>
                  </div>
                </>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="pea-plan-amount">{t("planAmountLabel")}</Label>
              <Input
                id="pea-plan-amount"
                name="expectedAmount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={
                  planDialog?.mode === "edit"
                    ? (planDialog.plan.expected_amount_eur ?? 200)
                    : 200
                }
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">{t("planAmountHint")}</p>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                value="true"
                defaultChecked={
                  planDialog?.mode === "edit" ? planDialog.plan.active : true
                }
                disabled={isPending}
                className="size-4 cursor-pointer"
              />
              {t("planActiveLabel")}
            </label>
            <input type="hidden" name="active" value="false" />

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" className="cursor-pointer" disabled={isPending}>
                {t("saveAndSync")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transactionFormTitle")}</DialogTitle>
            <DialogDescription>{t("transactionFormDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              run(() => createPeaTransactionAction(formData), () =>
                setTxDialogOpen(false),
              );
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="pea-tx-kind">{t("colKind")}</Label>
              <Select
                value={selectedKind}
                onValueChange={(value) =>
                  setSelectedKind(value as PeaTransactionKind)
                }
                disabled={isPending}
              >
                <SelectTrigger id="pea-tx-kind" className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind} className="cursor-pointer">
                      {t(`kind_${kind}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="kind" value={selectedKind} />
            </div>

            {needsHoldingForTx ? (
              <div className="space-y-2">
                <Label htmlFor="pea-tx-holding">{t("colHolding")}</Label>
                <Select
                  value={selectedHoldingId}
                  onValueChange={setSelectedHoldingId}
                  disabled={isPending || holdings.length === 0}
                >
                  <SelectTrigger id="pea-tx-holding" className="cursor-pointer">
                    <SelectValue placeholder={t("selectHolding")} />
                  </SelectTrigger>
                  <SelectContent>
                    {holdings.map((holding) => (
                      <SelectItem
                        key={holding.id}
                        value={holding.id}
                        className="cursor-pointer"
                      >
                        {holding.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="holdingId" value={selectedHoldingId} />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {needsHoldingForTx ? (
                <div className="space-y-2">
                  <Label htmlFor="pea-tx-quantity">{t("colQuantity")}</Label>
                  <Input
                    id="pea-tx-quantity"
                    name="quantity"
                    type="number"
                    step="any"
                    min="0"
                    required
                    disabled={isPending}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="pea-tx-amount">{t("colAmountEur")}</Label>
                <Input
                  id="pea-tx-amount"
                  name="amountEur"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pea-tx-date">{t("colDate")}</Label>
              <Input
                id="pea-tx-date"
                name="transactionDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pea-tx-note">{t("colNote")}</Label>
              <Input id="pea-tx-note" name="note" disabled={isPending} />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                className="cursor-pointer"
                disabled={isPending || (needsHoldingForTx && !selectedHoldingId)}
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={clearCsvOpen} onOpenChange={setClearCsvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearCsvImportTitle")}</DialogTitle>
            <DialogDescription>
              {t("clearCsvImportDescription", { count: csvTransactionCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
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
              onClick={() =>
                run(
                  () => clearPeaCsvImportAction(),
                  () => setClearCsvOpen(false),
                )
              }
            >
              {t("clearCsvImportConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${
            highlight ? "text-accent" : ""
          }`}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
