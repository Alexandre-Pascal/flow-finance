/**
 * @file crypto-portfolio.tsx
 * @description Portefeuille crypto : import, positions, transactions manuelles, flat tax.
 */

"use client";

import { Bitcoin, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useRef, useState, useTransition } from "react";
import {
  createCryptoTransactionAction,
  deleteCryptoHoldingAction,
  importCryptoFileAction,
  updateCryptoTotalInvestedAction,
  type CryptoActionError,
} from "@/app/actions/crypto";
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
import type { CryptoHoldingView, CryptoPortfolioSummary } from "@/lib/crypto/valuation";
import { formatCurrency, formatDate } from "@/lib/format";
import type { CryptoTransaction, CryptoTransactionKind } from "@/types/database";

const TRANSACTION_KINDS: CryptoTransactionKind[] = [
  "buy",
  "sell",
  "deposit",
  "withdrawal",
];

interface CryptoPortfolioProps {
  holdings: CryptoHoldingView[];
  transactions: CryptoTransaction[];
  summary: CryptoPortfolioSummary;
  totalInvestedEur: number;
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
}

function errorMessage(t: ReturnType<typeof useTranslations>, error?: CryptoActionError) {
  if (!error) return null;
  return t(`error_${error}` as never);
}

export function CryptoPortfolio({
  holdings,
  transactions,
  summary,
  totalInvestedEur,
  locale,
  isDemo,
  schemaReady,
}: CryptoPortfolioProps) {
  const t = useTranslations("crypto");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>("");
  const [selectedKind, setSelectedKind] = useState<CryptoTransactionKind>("buy");
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  function handleImport(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await importCryptoFileAction(formData);
      if (result.error) {
        setError(errorMessage(t, result.error));
        return;
      }
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      router.refresh();
    });
  }

  function handleCreateTransaction(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCryptoTransactionAction(formData);
      if (result.error) {
        setError(errorMessage(t, result.error));
        return;
      }
      setTxDialogOpen(false);
      router.refresh();
    });
  }

  function handleDeleteHolding(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    setError(null);
    startTransition(async () => {
      const result = await deleteCryptoHoldingAction(formData);
      if (result.error) {
        setError(errorMessage(t, result.error));
        return;
      }
      router.refresh();
    });
  }

  function handleUpdateTotalInvested(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateCryptoTotalInvestedAction(formData);
      if (result.error) {
        setError(errorMessage(t, result.error));
        return;
      }
      router.refresh();
    });
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true);
    setError(null);
    try {
      const response = await fetch("/api/crypto/prices");
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
          {t("schemaError")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("totalInvestedTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("totalInvestedHint")}</p>
          </div>
          <form
            className="flex w-full max-w-sm items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleUpdateTotalInvested(new FormData(event.currentTarget));
            }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="crypto-total-invested" className="sr-only">
                {t("totalInvestedLabel")}
              </Label>
              <Input
                id="crypto-total-invested"
                name="totalInvested"
                type="number"
                step="0.01"
                min="0"
                defaultValue={totalInvestedEur}
                disabled={isPending || isDemo}
                required
              />
            </div>
            <Button type="submit" variant="outline" className="cursor-pointer" disabled={isPending || isDemo}>
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpiCurrentValue")} value={formatCurrency(summary.currentValueEur, locale)} />
        <KpiCard
          label={t("kpiLatentGain")}
          value={formatCurrency(summary.latentGainEur, locale)}
        />
        <KpiCard label={t("kpiFlatTax")} value={formatCurrency(summary.flatTaxEur, locale)} />
        <KpiCard
          label={t("kpiNetIfSold")}
          value={formatCurrency(summary.netIfSoldTodayEur, locale)}
          highlight
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            handleImport(formData);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            id="crypto-import-file"
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

        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={isPending || isDemo || holdings.length === 0}
          onClick={() => {
            setSelectedHoldingId(holdings[0]?.id ?? "");
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
          disabled={refreshingPrices || holdings.length === 0}
          onClick={handleRefreshPrices}
        >
          <RefreshCw className={`size-4 ${refreshingPrices ? "animate-spin" : ""}`} aria-hidden />
          {refreshingPrices ? t("refreshingPrices") : t("refreshPrices")}
        </Button>
      </div>

      {holdings.length === 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Bitcoin className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-base">{t("emptyTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyDescription")}</p>
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
                  <TableHead>{t("colSymbol")}</TableHead>
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
                      {holding.xpub ? (
                        <div className="max-w-[12rem] truncate text-xs text-muted-foreground">
                          {holding.xpub}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{holding.symbol}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {holding.quantity}
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer text-muted-foreground hover:text-destructive"
                        disabled={isPending || isDemo}
                        onClick={() => handleDeleteHolding(holding.id)}
                        aria-label={t("deleteHolding")}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
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
                  <TableHead>{t("colNote")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const holding = holdings.find((item) => item.id === tx.holding_id);
                  return (
                    <TableRow key={tx.id}>
                      <TableCell>{formatDate(tx.transaction_date, locale)}</TableCell>
                      <TableCell>
                        {holding ? `${t(`kind_${tx.kind}` as never)} · ${holding.symbol}` : t(`kind_${tx.kind}` as never)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{tx.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(tx.amount_eur, locale)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {tx.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

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
              handleCreateTransaction(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="crypto-tx-holding">{t("colHolding")}</Label>
              <Select
                name="holdingId"
                value={selectedHoldingId}
                onValueChange={setSelectedHoldingId}
                disabled={isPending}
              >
                <SelectTrigger id="crypto-tx-holding" className="cursor-pointer">
                  <SelectValue placeholder={t("selectHolding")} />
                </SelectTrigger>
                <SelectContent>
                  {holdings.map((holding) => (
                    <SelectItem key={holding.id} value={holding.id} className="cursor-pointer">
                      {holding.name} · {holding.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="holdingId" value={selectedHoldingId} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="crypto-tx-kind">{t("colKind")}</Label>
              <Select
                value={selectedKind}
                onValueChange={(value) => setSelectedKind(value as CryptoTransactionKind)}
                disabled={isPending}
              >
                <SelectTrigger id="crypto-tx-kind" className="cursor-pointer">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crypto-tx-quantity">{t("colQuantity")}</Label>
                <Input
                  id="crypto-tx-quantity"
                  name="quantity"
                  type="number"
                  step="any"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-tx-amount">{t("colAmountEur")}</Label>
                <Input
                  id="crypto-tx-amount"
                  name="amountEur"
                  type="number"
                  step="0.01"
                  required
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="crypto-tx-date">{t("colDate")}</Label>
              <Input
                id="crypto-tx-date"
                name="transactionDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="crypto-tx-note">{t("colNote")}</Label>
              <Input id="crypto-tx-note" name="note" disabled={isPending} />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending}>
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" className="cursor-pointer" disabled={isPending || !selectedHoldingId}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
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
      </CardContent>
    </Card>
  );
}
