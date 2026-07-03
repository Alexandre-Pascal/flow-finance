/**
 * @file valuation.ts
 * @description Valorisation des positions crypto et application des transactions manuelles.
 */

import { computeFlatTax, type FlatTaxBreakdown } from "@/lib/crypto/flat-tax";
import type { CryptoHolding, CryptoTransaction, CryptoTransactionKind } from "@/types/database";

export interface CryptoHoldingView extends CryptoHolding {
  priceEur: number | null;
  valuation: FlatTaxBreakdown | null;
}

export interface CryptoPortfolioSummary extends FlatTaxBreakdown {
  holdingCount: number;
  pricedCount: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Applique une transaction manuelle au coût d'acquisition et à la quantité (PMP).
 */
export function applyCryptoTransaction(
  holding: Pick<CryptoHolding, "quantity" | "cost_basis_eur">,
  kind: CryptoTransactionKind,
  quantity: number,
  amountEur: number,
): Pick<CryptoHolding, "quantity" | "cost_basis_eur"> {
  const qty = round(quantity);
  const amount = round(amountEur);

  if (kind === "buy" || kind === "deposit") {
    return {
      quantity: round(holding.quantity + qty),
      cost_basis_eur: round(holding.cost_basis_eur + amount),
    };
  }

  const sellRatio = holding.quantity > 0 ? Math.min(1, qty / holding.quantity) : 0;
  const costRemoved = round(holding.cost_basis_eur * sellRatio);

  return {
    quantity: round(Math.max(0, holding.quantity - qty)),
    cost_basis_eur: round(Math.max(0, holding.cost_basis_eur - costRemoved)),
  };
}

export function buildCryptoHoldingViews(
  holdings: CryptoHolding[],
  pricesEur: Record<string, number>,
): CryptoHoldingView[] {
  return holdings.map((holding) => {
    const priceEur = pricesEur[holding.symbol.toUpperCase()] ?? null;
    const valuation =
      priceEur != null
        ? computeFlatTax(holding.quantity, holding.cost_basis_eur, priceEur)
        : null;

    return {
      ...holding,
      priceEur,
      valuation,
    };
  });
}

export function buildCryptoPortfolioSummary(
  views: CryptoHoldingView[],
): CryptoPortfolioSummary {
  const priced = views.filter((view) => view.valuation != null) as Array<
    CryptoHoldingView & { valuation: FlatTaxBreakdown }
  >;

  const totals = priced.reduce(
    (acc, view) => ({
      currentValueEur: acc.currentValueEur + view.valuation.currentValueEur,
      costBasisEur: acc.costBasisEur + view.valuation.costBasisEur,
      latentGainEur: acc.latentGainEur + view.valuation.latentGainEur,
      flatTaxEur: acc.flatTaxEur + view.valuation.flatTaxEur,
      netIfSoldTodayEur: acc.netIfSoldTodayEur + view.valuation.netIfSoldTodayEur,
    }),
    {
      currentValueEur: 0,
      costBasisEur: 0,
      latentGainEur: 0,
      flatTaxEur: 0,
      netIfSoldTodayEur: 0,
    },
  );

  return {
    ...totals,
    currentValueEur: round(totals.currentValueEur),
    costBasisEur: round(totals.costBasisEur),
    latentGainEur: round(totals.latentGainEur),
    flatTaxEur: round(totals.flatTaxEur),
    netIfSoldTodayEur: round(totals.netIfSoldTodayEur),
    holdingCount: views.length,
    pricedCount: priced.length,
  };
}

export function mapCryptoHolding(row: Record<string, unknown>): CryptoHolding {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    xpub: row.xpub ? String(row.xpub) : null,
    symbol: String(row.symbol).toUpperCase(),
    quantity: Number(row.quantity),
    cost_basis_eur: Number(row.cost_basis_eur),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapCryptoTransaction(row: Record<string, unknown>): CryptoTransaction {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    holding_id: String(row.holding_id),
    kind: row.kind as CryptoTransactionKind,
    quantity: Number(row.quantity),
    amount_eur: Number(row.amount_eur),
    transaction_date: String(row.transaction_date),
    note: row.note ? String(row.note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
