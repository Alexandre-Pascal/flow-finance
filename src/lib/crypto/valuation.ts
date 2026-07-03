/**
 * @file valuation.ts
 * @description Valorisation des positions crypto et flat tax au niveau portefeuille.
 */

import { computePortfolioFlatTax, type FlatTaxBreakdown } from "@/lib/crypto/flat-tax";
import type { CryptoHolding, CryptoTransaction, CryptoTransactionKind } from "@/types/database";

export interface CryptoHoldingView extends CryptoHolding {
  priceEur: number | null;
  currentValueEur: number | null;
}

export interface CryptoPortfolioSummary extends FlatTaxBreakdown {
  holdingCount: number;
  pricedCount: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Applique une transaction manuelle à la quantité (le coût d'acquisition par ligne n'impacte plus la flat tax).
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
    const currentValueEur =
      priceEur != null ? round(holding.quantity * priceEur) : null;

    return {
      ...holding,
      priceEur,
      currentValueEur,
    };
  });
}

export function buildCryptoPortfolioSummary(
  views: CryptoHoldingView[],
  totalInvestedEur: number,
): CryptoPortfolioSummary {
  const priced = views.filter((view) => view.currentValueEur != null);
  const currentValueEur = round(
    priced.reduce((sum, view) => sum + (view.currentValueEur ?? 0), 0),
  );

  const tax = computePortfolioFlatTax(currentValueEur, totalInvestedEur);

  return {
    ...tax,
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

export function mapCryptoPortfolioSettings(
  row: Record<string, unknown> | null,
): { totalInvestedEur: number } {
  if (!row) {
    return { totalInvestedEur: 2163 };
  }
  return { totalInvestedEur: Number(row.total_invested_eur ?? 2163) };
}
