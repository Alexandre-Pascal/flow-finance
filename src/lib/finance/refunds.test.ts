import { describe, expect, it } from "vitest";
import { buildMonthlyOverview, buildMonthlySpending } from "./aggregates";
import { buildCategoryBreakdown } from "./category-analytics";
import {
  budgetExpenseAmount,
  getIncomeMonthKey,
  shouldCountAsBudgetIncome,
} from "./payroll-budget";
import { isRefund } from "./refunds";
import { buildMonthlyTransferOverview } from "./tracked-transfers";
import type { TransactionWithAccount } from "@/types/database";

function tx(
  overrides: Partial<TransactionWithAccount> & {
    booking_date: string;
    amount: number;
  },
): TransactionWithAccount {
  return {
    id: `tx-${overrides.booking_date}-${overrides.amount}`,
    account_id: "acc-1",
    entry_reference: "ref",
    currency: "EUR",
    description: "Mouvement",
    status: "BOOK",
    category_id: null,
    category_manual: false,
    recurring_payment_id: null,
    recurring_payment_manual: false,
    note: null,
    created_at: `${overrides.booking_date}T00:00:00Z`,
    updated_at: `${overrides.booking_date}T00:00:00Z`,
    account_name: "Compte courant",
    account_type: "checking",
    ...overrides,
  };
}

/** 100 € de loisirs avancés, puis quatre amis qui rendent 20 €. */
const leisureExpense = tx({
  booking_date: "2026-10-03",
  amount: -100,
  category_id: "cat-loisirs",
  category_manual: true,
  category_name: "Loisirs",
  category_color: "#F97316",
});

const refunds = [1, 2, 3, 4].map((index) =>
  tx({
    booking_date: `2026-10-0${index + 4}`,
    amount: 20,
    description: `Virement de Paul ${index}`,
    category_id: "cat-loisirs",
    category_manual: true,
    category_name: "Loisirs",
    category_color: "#F97316",
  }),
);

const labels = {
  subscriptions: "Abonnements",
  uncategorized: "Non classé",
  spaceTransfer: "Autre espace",
};

describe("remboursements", () => {
  it("reconnaît une rentrée catégorisée à la main", () => {
    expect(isRefund(refunds[0])).toBe(true);
    // Une dépense catégorisée reste une dépense.
    expect(isRefund(leisureExpense)).toBe(false);
    // Une rentrée sans catégorie est un revenu ordinaire.
    expect(isRefund(tx({ booking_date: "2026-10-05", amount: 20 }))).toBe(false);
    // Une catégorie posée automatiquement ne vaut pas remboursement.
    expect(
      isRefund(
        tx({
          booking_date: "2026-10-05",
          amount: 20,
          category_id: "cat-loisirs",
        }),
      ),
    ).toBe(false);
  });

  it("ne compte jamais un remboursement en revenu", () => {
    expect(shouldCountAsBudgetIncome(refunds[0])).toBe(false);
    expect(
      shouldCountAsBudgetIncome(tx({ booking_date: "2026-10-05", amount: 20 })),
    ).toBe(true);
  });

  it("le retranche de sa catégorie", () => {
    expect(budgetExpenseAmount(leisureExpense)).toBe(100);
    expect(budgetExpenseAmount(refunds[0])).toBe(-20);

    const breakdown = buildCategoryBreakdown(
      [leisureExpense, ...refunds],
      "fr",
      labels,
    );
    const october = breakdown.months.find((row) => row.monthKey === "2026-10");
    expect(october?.values["cat-loisirs"]).toBe(20);
    expect(october?.total).toBe(20);
  });

  it("n'inverse pas une catégorie remboursée au-delà de la dépense", () => {
    // L'avance faite en octobre, rendue en novembre : novembre ne rapporte
    // rien, il ne coûte rien.
    const late = tx({
      booking_date: "2026-11-02",
      amount: 60,
      category_id: "cat-loisirs",
      category_manual: true,
      category_name: "Loisirs",
    });
    const breakdown = buildCategoryBreakdown([leisureExpense, late], "fr", labels);
    const november = breakdown.months.find((row) => row.monthKey === "2026-11");
    expect(november?.values["cat-loisirs"] ?? 0).toBe(0);
  });

  it("allège le mois sans gonfler les revenus", () => {
    const overview = buildMonthlyOverview([leisureExpense, ...refunds], "fr");
    const october = overview.find((row) => row.monthKey === "2026-10");
    expect(october?.expenses).toBe(20);
    expect(october?.income).toBe(0);
  });

  it("allège aussi la courbe des dépenses", () => {
    const current = new Date();
    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    const spent = tx({
      booking_date: `${monthKey}-03`,
      amount: -100,
      category_id: "cat-loisirs",
      category_manual: true,
      category_name: "Loisirs",
    });
    const paidBack = tx({
      booking_date: `${monthKey}-07`,
      amount: 80,
      category_id: "cat-loisirs",
      category_manual: true,
      category_name: "Loisirs",
    });

    const series = buildMonthlySpending([spent, paidBack], "fr");
    expect(series.at(-1)?.amount).toBe(20);
  });
});

describe("mois financé par une rentrée", () => {
  const anais = tx({
    booking_date: "2026-09-28",
    amount: 300,
    description: "Apple Pay Top-Up by *2199",
  });

  it("suit le mois de réception par défaut", () => {
    expect(getIncomeMonthKey(anais)).toBe("2026-09");
  });

  it("finance le mois suivant quand on le demande", () => {
    expect(
      getIncomeMonthKey({ ...anais, budget_month_shift: 1 }),
    ).toBe("2026-10");
  });

  it("prime sur la règle du salaire", () => {
    const payroll = tx({
      booking_date: "2026-09-28",
      amount: 3000,
      description: "VIREMENT EN VOTRE FAVEUR VIR INST de CyFyn Paye",
      budget_month_shift: 0,
    });
    // Sans le choix manuel, un salaire du 28 financerait octobre.
    expect(
      getIncomeMonthKey(payroll, {
        payrollKeyword: "CYFYN",
        budgetShiftMonths: 1,
      }),
    ).toBe("2026-09");
  });

  it("déplace la rentrée dans le budget du mois visé", () => {
    const overview = buildMonthlyOverview([
      { ...anais, budget_month_shift: 1 },
    ], "fr");
    // Septembre n'a plus de rentrée du tout : la série démarre en octobre.
    expect(overview.find((row) => row.monthKey === "2026-09")?.income ?? 0).toBe(
      0,
    );
    expect(overview.find((row) => row.monthKey === "2026-10")?.income).toBe(300);
  });

  it("déplace aussi la série du graphe", () => {
    const series = buildMonthlyTransferOverview(
      [{ ...anais, budget_month_shift: 1 }],
      "fr",
      () => true,
    );
    expect(series.find((row) => row.monthKey === "2026-09")?.amount ?? 0).toBe(
      0,
    );
    expect(series.find((row) => row.monthKey === "2026-10")?.amount).toBe(300);
  });
});
