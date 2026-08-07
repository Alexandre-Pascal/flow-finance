"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { getFinanceData } from "@/lib/finance/queries";
import { fetchQuoteEurOn } from "@/lib/market/prices";
import { normalizeIsin, resolveTicker } from "@/lib/market/tickers";
import { parsePeaImportFile } from "@/lib/pea/import";
import { applyPeaTransaction, mapPeaTransaction } from "@/lib/pea/valuation";
import { createClient } from "@/lib/supabase/server";
import type { PeaTransaction, PeaTransactionKind } from "@/types/database";

export type PeaActionError =
  | "demo"
  | "invalid"
  | "config"
  | "schema"
  | "save"
  | "parse";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const PEA_TRANSACTION_KINDS: PeaTransactionKind[] = [
  "buy",
  "sell",
  "dividend",
  "deposit",
  "withdrawal",
  "fee",
  "interest",
];

function revalidatePeaPages() {
  for (const locale of ["fr", "en"]) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/savings`);
    revalidatePath(`/${locale}/investments/pea`);
    revalidatePath(`/${locale}/transactions`);
  }
}

function isSchemaError(message: string, code?: string): boolean {
  const normalized = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    normalized.includes("pea_holdings") ||
    normalized.includes("pea_transactions") ||
    normalized.includes("pea_investment_plans") ||
    normalized.includes("pea_settings") ||
    normalized.includes("pea_plan_id") ||
    normalized.includes("does not exist")
  );
}

function toActionError(error: { message: string; code?: string }): PeaActionError {
  return isSchemaError(error.message, error.code) ? "schema" : "save";
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseKind(raw: string): PeaTransactionKind | null {
  return PEA_TRANSACTION_KINDS.includes(raw as PeaTransactionKind)
    ? (raw as PeaTransactionKind)
    : null;
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 2);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Recalcule quantité et prix de revient de chaque ligne à partir de l'ensemble
 * de ses mouvements. Les positions ne sont jamais écrites en incrémental : elles
 * sont toujours dérivées, ce qui rend les imports et les purges idempotents.
 */
async function recomputePeaHoldings(
  supabase: SupabaseClient,
  userId: string,
): Promise<PeaActionError | null> {
  const [{ data: holdingRows, error: holdingsError }, { data: txRows, error: txError }] =
    await Promise.all([
      supabase.from("pea_holdings").select("id").eq("user_id", userId),
      supabase
        .from("pea_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("transaction_date", { ascending: true }),
    ]);

  if (holdingsError) return toActionError(holdingsError);
  if (txError) return toActionError(txError);

  const transactions = (txRows ?? []).map((row) =>
    mapPeaTransaction(row as Record<string, unknown>),
  );

  const byHolding = new Map<string, PeaTransaction[]>();
  for (const tx of transactions) {
    if (!tx.holding_id) continue;
    const list = byHolding.get(tx.holding_id) ?? [];
    list.push(tx);
    byHolding.set(tx.holding_id, list);
  }

  for (const holding of holdingRows ?? []) {
    const id = String(holding.id);
    let position = { quantity: 0, cost_basis_eur: 0 };

    for (const tx of byHolding.get(id) ?? []) {
      position = applyPeaTransaction(position, tx.kind, tx.quantity, tx.amount_eur);
    }

    const { error } = await supabase
      .from("pea_holdings")
      .update(position)
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return toActionError(error);
  }

  return null;
}

export async function createPeaHoldingAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const isin = normalizeIsin(String(formData.get("isin") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim();

  if (!isin || isin.length < 8 || !name) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase.from("pea_holdings").upsert(
    {
      user_id: user.id,
      isin,
      name,
      ticker: ticker || null,
    },
    { onConflict: "user_id,isin" },
  );

  if (error) {
    return { error: toActionError(error) };
  }

  revalidatePeaPages();
  return {};
}

export async function updatePeaHoldingAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim();
  const manualPriceRaw = String(formData.get("manualPrice") ?? "").trim();
  const manualPrice = manualPriceRaw ? parseAmount(manualPriceRaw) : null;

  if (!id || !name || (manualPriceRaw && (manualPrice === null || manualPrice <= 0))) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("pea_holdings")
    .update({
      name,
      ticker: ticker || null,
      manual_price_eur: manualPrice,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: toActionError(error) };
  }

  revalidatePeaPages();
  return {};
}

export async function deletePeaHoldingAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("pea_holdings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: toActionError(error) };
  }

  revalidatePeaPages();
  return {};
}

export async function createPeaTransactionAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const holdingId = String(formData.get("holdingId") ?? "").trim();
  const kind = parseKind(String(formData.get("kind") ?? ""));
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = quantityRaw ? parseAmount(quantityRaw) : 0;
  const amountEur = parseAmount(String(formData.get("amountEur") ?? ""));
  const transactionDate = String(formData.get("transactionDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!kind || quantity === null || amountEur === null || !transactionDate) {
    return { error: "invalid" };
  }

  if (quantity < 0 || amountEur < 0) {
    return { error: "invalid" };
  }

  // Un ordre porte forcément sur une ligne ; les mouvements espèces non.
  const needsHolding = kind === "buy" || kind === "sell";
  if (needsHolding && (!holdingId || quantity <= 0)) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase.from("pea_transactions").insert({
    user_id: user.id,
    holding_id: holdingId || null,
    kind,
    quantity,
    amount_eur: amountEur,
    transaction_date: transactionDate,
    note: note || null,
    source: "manual",
  });

  if (error) {
    return { error: toActionError(error) };
  }

  const recomputeError = await recomputePeaHoldings(supabase, user.id);
  if (recomputeError) {
    return { error: recomputeError };
  }

  revalidatePeaPages();
  return {};
}

export async function deletePeaTransactionAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("pea_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: toActionError(error) };
  }

  const recomputeError = await recomputePeaHoldings(supabase, user.id);
  if (recomputeError) {
    return { error: recomputeError };
  }

  revalidatePeaPages();
  return {};
}

export async function updatePeaSettingsAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const openingDate = String(formData.get("openingDate") ?? "").trim();
  const cashRaw = String(formData.get("cashBalance") ?? "").trim();
  const cashBalance = cashRaw ? parseAmount(cashRaw) : 0;

  if (cashBalance === null || cashBalance < 0) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase.from("pea_settings").upsert(
    {
      user_id: user.id,
      opening_date: openingDate || null,
      cash_balance_eur: cashBalance,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: toActionError(error) };
  }

  revalidatePeaPages();
  return {};
}

export async function createPeaPlanAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  return upsertPeaPlan(formData, "create");
}

export async function updatePeaPlanAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  return upsertPeaPlan(formData, "update");
}

async function upsertPeaPlan(
  formData: FormData,
  mode: "create" | "update",
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  const existingHoldingId = String(formData.get("holdingId") ?? "").trim();
  const isin = normalizeIsin(String(formData.get("isin") ?? ""));
  const etfName = String(formData.get("etfName") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim();
  const expectedRaw = String(formData.get("expectedAmount") ?? "").trim();
  const expectedAmount = expectedRaw ? parseAmount(expectedRaw) : null;
  // La case à cocher envoie "true" ; un champ caché "false" reste présent.
  // On considère le plan actif dès qu'une valeur "true" apparaît.
  const active = formData.getAll("active").map(String).includes("true");

  if (!label || keywords.length === 0) {
    return { error: "invalid" };
  }

  // Un plan doit cibler un ETF : soit une ligne existante, soit ISIN + nom.
  if (!existingHoldingId && (isin.length < 8 || !etfName)) {
    return { error: "invalid" };
  }

  if (mode === "update" && !id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  let holdingId = existingHoldingId;

  if (isin && etfName) {
    const { data: holding, error: holdingError } = await supabase
      .from("pea_holdings")
      .upsert(
        {
          user_id: user.id,
          isin,
          name: etfName,
          ticker: ticker || resolveTicker(isin),
        },
        { onConflict: "user_id,isin" },
      )
      .select("id")
      .single();

    if (holdingError || !holding) {
      return { error: holdingError ? toActionError(holdingError) : "save" };
    }

    holdingId = String(holding.id);
  }

  const payload = {
    label,
    keywords,
    holding_id: holdingId || null,
    expected_amount_eur: expectedAmount,
    active,
  };

  const { error } =
    mode === "create"
      ? await supabase
          .from("pea_investment_plans")
          .insert({ user_id: user.id, ...payload })
      : await supabase
          .from("pea_investment_plans")
          .update(payload)
          .eq("id", id)
          .eq("user_id", user.id);

  if (error) {
    return { error: toActionError(error) };
  }

  // Dès qu'un plan est prêt, on matérialise les virements déjà synchronisés.
  if (active && holdingId) {
    const syncResult = await syncPeaBankTransfersAction();
    if (syncResult.error) {
      return { error: syncResult.error };
    }
  }

  revalidatePeaPages();
  return {};
}

export async function deletePeaPlanAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("pea_investment_plans")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: toActionError(error) };
  }

  revalidatePeaPages();
  return {};
}

/**
 * Rattache manuellement une transaction bancaire à un plan d'investissement,
 * ou lève le rattachement quand aucun plan n'est fourni.
 */
export async function assignTransactionPeaPlanAction(
  formData: FormData,
): Promise<{ error?: PeaActionError }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();

  if (!transactionId) {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      pea_plan_id: planId || null,
      pea_manual: Boolean(planId),
    })
    .eq("id", transactionId);

  if (error) {
    return { error: toActionError(error) };
  }

  revalidatePeaPages();
  return {};
}

/**
 * Matérialise les virements vers le PEA détectés au libellé : chaque virement
 * devient un versement, complété d'une estimation de parts achetées au cours de
 * clôture du jour. Ces estimations portent `source = 'bank_estimate'` et sont
 * remplacées par l'import CSV, qui fait autorité.
 */
export async function syncPeaBankTransfersAction(): Promise<{
  error?: PeaActionError;
  created?: number;
}> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const [{ transactions }, { data: holdingRows, error: holdingsError }] =
    await Promise.all([
      getFinanceData("fr", {
        savingsAdjustments: false,
        dismissedSuggestions: false,
        bankConnection: false,
      }),
      supabase
        .from("pea_holdings")
        .select("id, isin, ticker")
        .eq("user_id", user.id),
    ]);

  if (holdingsError) {
    return { error: toActionError(holdingsError) };
  }

  const tickerByHolding = new Map(
    (holdingRows ?? []).map((row) => [
      String(row.id),
      resolveTicker(String(row.isin), row.ticker ? String(row.ticker) : null),
    ]),
  );

  const transfers = transactions.filter((tx) => tx.pea_transfer);
  if (transfers.length === 0) {
    return { created: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("pea_transactions")
    .select("external_ref")
    .eq("user_id", user.id)
    .eq("source", "bank_estimate");

  if (existingError) {
    return { error: toActionError(existingError) };
  }

  const existingRefs = new Set(
    (existingRows ?? [])
      .map((row) => (row.external_ref ? String(row.external_ref) : ""))
      .filter(Boolean),
  );

  const payloads: Array<Record<string, unknown>> = [];

  for (const tx of transfers) {
    const ref = tx.pea_transfer;
    if (!ref) continue;

    const amountEur = round(Math.abs(tx.amount), 2);
    if (amountEur <= 0) continue;

    const isDeposit = ref.direction === "deposit";
    const cashRef = `bank:${tx.id}:${isDeposit ? "deposit" : "withdrawal"}`;

    if (!existingRefs.has(cashRef)) {
      payloads.push({
        user_id: user.id,
        holding_id: null,
        kind: isDeposit ? "deposit" : "withdrawal",
        quantity: 0,
        amount_eur: amountEur,
        transaction_date: tx.booking_date,
        note: ref.plan_label,
        source: "bank_estimate",
        external_ref: cashRef,
        bank_transaction_id: tx.id,
      });
    }

    if (!isDeposit || !ref.holding_id) {
      continue;
    }

    const buyRef = `bank:${tx.id}:buy`;
    if (existingRefs.has(buyRef)) {
      continue;
    }

    const ticker = tickerByHolding.get(ref.holding_id) ?? null;
    if (!ticker) {
      continue;
    }

    const price = await fetchQuoteEurOn(ticker, tx.booking_date);
    if (price == null || price <= 0) {
      continue;
    }

    // PEA Trade Republic : parts entières uniquement — on achète le max
    // possible avec le montant viré (le reliquat reste en espèces côté TR).
    const wholeShares = Math.floor(amountEur / price);
    if (wholeShares <= 0) {
      continue;
    }

    const investedEur = round(wholeShares * price, 2);

    payloads.push({
      user_id: user.id,
      holding_id: ref.holding_id,
      kind: "buy",
      quantity: wholeShares,
      amount_eur: investedEur,
      transaction_date: tx.booking_date,
      note: ref.plan_label,
      source: "bank_estimate",
      external_ref: buyRef,
      bank_transaction_id: tx.id,
    });
  }

  if (payloads.length === 0) {
    return { created: 0 };
  }

  const { error: insertError } = await supabase
    .from("pea_transactions")
    .upsert(payloads, {
      onConflict: "user_id,external_ref",
      ignoreDuplicates: true,
    });

  if (insertError) {
    return { error: toActionError(insertError) };
  }

  const recomputeError = await recomputePeaHoldings(supabase, user.id);
  if (recomputeError) {
    return { error: recomputeError };
  }

  revalidatePeaPages();
  return { created: payloads.length };
}

/**
 * Supprime tous les mouvements issus d'un import CSV, recalcule les positions
 * et retire les lignes devenues vides. Les estimations bancaires et les
 * mouvements manuels sont conservés.
 */
export async function clearPeaCsvImportAction(): Promise<{
  error?: PeaActionError;
  deleted?: number;
}> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  const { data: csvRows, error: listError } = await supabase
    .from("pea_transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "csv");

  if (listError) {
    return { error: toActionError(listError) };
  }

  const deleted = csvRows?.length ?? 0;
  if (deleted === 0) {
    return { deleted: 0 };
  }

  const { error: deleteError } = await supabase
    .from("pea_transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("source", "csv");

  if (deleteError) {
    return { error: toActionError(deleteError) };
  }

  const recomputeError = await recomputePeaHoldings(supabase, user.id);
  if (recomputeError) {
    return { error: recomputeError };
  }

  // Retire les lignes sans mouvement restant et sans quantité.
  const [{ data: holdingRows }, { data: remainingTx }] = await Promise.all([
    supabase.from("pea_holdings").select("id, quantity").eq("user_id", user.id),
    supabase.from("pea_transactions").select("holding_id").eq("user_id", user.id),
  ]);

  const holdingsWithTx = new Set(
    (remainingTx ?? [])
      .map((row) => (row.holding_id ? String(row.holding_id) : ""))
      .filter(Boolean),
  );

  const orphanIds = (holdingRows ?? [])
    .filter(
      (row) =>
        Number(row.quantity) === 0 && !holdingsWithTx.has(String(row.id)),
    )
    .map((row) => String(row.id));

  if (orphanIds.length > 0) {
    // Les plans pointent en SET NULL sur holding_id : on peut supprimer sans
    // casser la détection des virements (il faudra re-lier la ligne cible).
    const { error: orphanError } = await supabase
      .from("pea_holdings")
      .delete()
      .eq("user_id", user.id)
      .in("id", orphanIds);

    if (orphanError) {
      return { error: toActionError(orphanError) };
    }
  }

  revalidatePeaPages();
  return { deleted };
}

/**
 * Importe un export CSV Trade Republic. Le fichier fait autorité sur la période
 * qu'il couvre : les estimations issues des virements bancaires y sont purgées
 * avant que les positions ne soient recalculées.
 */
export async function importPeaFileAction(
  formData: FormData,
): Promise<{ error?: PeaActionError; imported?: number }> {
  const user = await requireAuth();
  if (user.isDemo) {
    return { error: "demo" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "invalid" };
  }

  let parsed;
  try {
    parsed = parsePeaImportFile(await file.text());
  } catch {
    return { error: "parse" };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: "config" };
  }

  // 1. Les lignes du fichier créent ou complètent les positions du plan.
  for (const position of parsed.positions) {
    const { error } = await supabase.from("pea_holdings").upsert(
      {
        user_id: user.id,
        isin: position.isin,
        name: position.name,
        ticker: resolveTicker(position.isin),
      },
      { onConflict: "user_id,isin", ignoreDuplicates: false },
    );

    if (error) {
      return { error: toActionError(error) };
    }
  }

  const { data: holdingRows, error: holdingsError } = await supabase
    .from("pea_holdings")
    .select("id, isin")
    .eq("user_id", user.id);

  if (holdingsError) {
    return { error: toActionError(holdingsError) };
  }

  const holdingIdByIsin = new Map(
    (holdingRows ?? []).map((row) => [String(row.isin), String(row.id)]),
  );

  // 2. Les mouvements du fichier, idempotents grâce à external_ref.
  const payloads = parsed.rows.map((row) => ({
    user_id: user.id,
    holding_id: row.isin ? (holdingIdByIsin.get(row.isin) ?? null) : null,
    kind: row.kind,
    quantity: row.quantity,
    amount_eur: row.amountEur,
    transaction_date: row.transactionDate,
    note: row.name,
    source: "csv" as const,
    external_ref: row.externalRef,
  }));

  const { error: insertError } = await supabase
    .from("pea_transactions")
    .upsert(payloads, { onConflict: "user_id,external_ref" });

  if (insertError) {
    return { error: toActionError(insertError) };
  }

  // 3. Purge des estimations couvertes par le fichier.
  const { error: purgeError } = await supabase
    .from("pea_transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("source", "bank_estimate")
    .gte("transaction_date", parsed.periodStart)
    .lte("transaction_date", parsed.periodEnd);

  if (purgeError) {
    return { error: toActionError(purgeError) };
  }

  const recomputeError = await recomputePeaHoldings(supabase, user.id);
  if (recomputeError) {
    return { error: recomputeError };
  }

  revalidatePeaPages();
  return { imported: parsed.rows.length };
}
