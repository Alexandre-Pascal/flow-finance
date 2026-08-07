/**
 * @file valuation.ts
 * @description Valorisation des lignes du PEA et synthèse fiscale du plan.
 */

import { resolveTicker } from "@/lib/market/tickers";
import { computePeaTax, type PeaTaxBreakdown } from "@/lib/pea/tax";
import type {
  PeaHolding,
  PeaSettings,
  PeaTransaction,
  PeaTransactionKind,
} from "@/types/database";

export interface PeaHoldingView extends PeaHolding {
  /** Symbole retenu pour interroger les cours (explicite ou déduit de l'ISIN). */
  resolvedTicker: string | null;
  priceEur: number | null;
  currentValueEur: number | null;
  /** Vrai si la quantité provient au moins en partie d'une estimation bancaire. */
  hasEstimatedQuantity: boolean;
}

export interface PeaPortfolioSummary extends PeaTaxBreakdown {
  holdingCount: number;
  pricedCount: number;
  cashBalanceEur: number;
  /** Valeur des titres plus les liquidités du plan. */
  totalValueEur: number;
  hasEstimates: boolean;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Applique un mouvement à une position (quantité et prix de revient). */
export function applyPeaTransaction(
  holding: Pick<PeaHolding, "quantity" | "cost_basis_eur">,
  kind: PeaTransactionKind,
  quantity: number,
  amountEur: number,
): Pick<PeaHolding, "quantity" | "cost_basis_eur"> {
  const qty = round(quantity, 8);
  const amount = round(amountEur);

  if (kind === "buy") {
    return {
      quantity: round(holding.quantity + qty, 8),
      cost_basis_eur: round(holding.cost_basis_eur + amount),
    };
  }

  if (kind === "sell") {
    const sellRatio =
      holding.quantity > 0 ? Math.min(1, qty / holding.quantity) : 0;
    const costRemoved = round(holding.cost_basis_eur * sellRatio);

    return {
      quantity: round(Math.max(0, holding.quantity - qty), 8),
      cost_basis_eur: round(Math.max(0, holding.cost_basis_eur - costRemoved)),
    };
  }

  // Dividendes, frais, versements et retraits ne modifient pas la position.
  return { quantity: holding.quantity, cost_basis_eur: holding.cost_basis_eur };
}

export function buildPeaHoldingViews(
  holdings: PeaHolding[],
  pricesEur: Record<string, number>,
  estimatedHoldingIds: Set<string> = new Set(),
): PeaHoldingView[] {
  return holdings.map((holding) => {
    const resolvedTicker = resolveTicker(holding.isin, holding.ticker);
    const priceEur =
      holding.manual_price_eur != null
        ? Number(holding.manual_price_eur)
        : resolvedTicker
          ? (pricesEur[resolvedTicker] ?? null)
          : null;

    return {
      ...holding,
      resolvedTicker,
      priceEur,
      currentValueEur: priceEur != null ? round(holding.quantity * priceEur) : null,
      hasEstimatedQuantity: estimatedHoldingIds.has(holding.id),
    };
  });
}

/**
 * Versements nets du plan (versements moins retraits), base de calcul de la
 * plus-value latente.
 */
export function sumPeaDeposits(transactions: PeaTransaction[]): number {
  return round(
    Math.max(
      0,
      transactions.reduce((sum, tx) => {
        if (tx.kind === "deposit") return sum + tx.amount_eur;
        if (tx.kind === "withdrawal") return sum - tx.amount_eur;
        return sum;
      }, 0),
    ),
  );
}

export function buildPeaPortfolioSummary(
  views: PeaHoldingView[],
  transactions: PeaTransaction[],
  settings: PeaSettings | null,
): PeaPortfolioSummary {
  const priced = views.filter((view) => view.currentValueEur != null);
  const currentValueEur = round(
    priced.reduce((sum, view) => sum + (view.currentValueEur ?? 0), 0),
  );

  const cashBalanceEur = round(settings?.cash_balance_eur ?? 0);
  const tax = computePeaTax(
    currentValueEur,
    sumPeaDeposits(transactions),
    settings?.opening_date ?? null,
  );

  return {
    ...tax,
    holdingCount: views.length,
    pricedCount: priced.length,
    cashBalanceEur,
    totalValueEur: round(currentValueEur + cashBalanceEur),
    hasEstimates: views.some((view) => view.hasEstimatedQuantity),
  };
}

export function mapPeaHolding(row: Record<string, unknown>): PeaHolding {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    isin: String(row.isin).toUpperCase(),
    ticker: row.ticker ? String(row.ticker) : null,
    name: String(row.name),
    quantity: Number(row.quantity),
    cost_basis_eur: Number(row.cost_basis_eur),
    manual_price_eur:
      row.manual_price_eur == null ? null : Number(row.manual_price_eur),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapPeaTransaction(row: Record<string, unknown>): PeaTransaction {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    holding_id: row.holding_id ? String(row.holding_id) : null,
    kind: row.kind as PeaTransactionKind,
    quantity: Number(row.quantity ?? 0),
    amount_eur: Number(row.amount_eur ?? 0),
    transaction_date: String(row.transaction_date),
    note: row.note ? String(row.note) : null,
    source: (row.source as PeaTransaction["source"]) ?? "manual",
    external_ref: row.external_ref ? String(row.external_ref) : null,
    bank_transaction_id: row.bank_transaction_id
      ? String(row.bank_transaction_id)
      : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapPeaSettings(
  row: Record<string, unknown> | null,
  userId: string,
): PeaSettings {
  if (!row) {
    return {
      user_id: userId,
      opening_date: null,
      cash_balance_eur: 0,
      created_at: "",
      updated_at: "",
    };
  }

  return {
    user_id: String(row.user_id ?? userId),
    opening_date: row.opening_date ? String(row.opening_date) : null,
    cash_balance_eur: Number(row.cash_balance_eur ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
