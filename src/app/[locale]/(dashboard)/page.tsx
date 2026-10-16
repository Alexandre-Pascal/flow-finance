import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { KpiCard } from "@/components/features/kpi-card";
import { SpendingChart } from "@/components/features/spending-chart";
import { TransactionsTable } from "@/components/features/transactions-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildMonthlySpending,
  getCurrentMonthTransactions,
  sumAccountBalances,
} from "@/lib/finance/aggregates";
import {
  budgetExpenseAmount,
  sumBudgetMonthIncome,
} from "@/lib/finance/payroll-budget";
import { getFinanceData } from "@/lib/finance/queries";
import { accountLabel } from "@/lib/finance/spaces";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { getConfiguredIncomeSources } from "@/lib/profile-settings";
import { formatCurrency } from "@/lib/format";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const [{ accounts, transactions, categories, monthlySpending, isDemo }, profileSettings] =
    await Promise.all([
      getFinanceData(locale, {
        savingsAdjustments: false,
        dismissedSuggestions: false,
        bankConnection: false,
      }),
      getProfileSettings(),
    ]);

  const totalBalance = sumAccountBalances(accounts);
  // Le total ne dit pas d'où vient l'argent : le détail par compte s'affiche
  // au survol, du plus gros solde au plus petit.
  const balanceRows = [...accounts]
    .sort((a, b) => b.balance - a.balance)
    .map((account) => ({
      id: account.id,
      label: accountLabel(account),
      value: formatCurrency(account.balance, locale, account.currency),
      hint:
        account.type === "savings"
          ? t("balanceSavings")
          : t("balanceChecking"),
    }));
  const monthTx = getCurrentMonthTransactions(transactions).filter(
    (tx) => !tx.savings_transfer,
  );
  const payrollOptions = {
    payrollKeyword: profileSettings.payroll.keyword,
    budgetShiftMonths: profileSettings.payroll.budgetShiftMonths,
    incomeSources: getConfiguredIncomeSources(profileSettings),
  };
  // Même règle que partout ailleurs : les virements entre comptes ne coûtent
  // rien et les remboursements allègent le mois.
  const spending = Math.max(
    0,
    monthTx.reduce((sum, tx) => sum + budgetExpenseAmount(tx, payrollOptions), 0),
  );
  const income = sumBudgetMonthIncome(transactions, new Date(), payrollOptions);

  const recent = [...transactions]
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date))
    .slice(0, 5);

  const chartData =
    monthlySpending.length > 0
      ? monthlySpending
      : buildMonthlySpending(transactions, locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title={t("totalBalance")}
          value={formatCurrency(totalBalance, locale)}
          icon={Wallet}
          variant="accent"
          breakdown={balanceRows}
          breakdownLabel={t("balanceBreakdown")}
        />
        <KpiCard
          title={t("monthlySpending")}
          value={formatCurrency(spending, locale)}
          icon={ArrowDownLeft}
        />
        <KpiCard
          title={t("monthlyIncome")}
          value={formatCurrency(income, locale)}
          icon={ArrowUpRight}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">
              {t("spendingChart")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="cursor-pointer" asChild>
              <Link href="/analytics">{t("viewAnalytics")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <SpendingChart data={chartData} title="" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">
              {t("recentTransactions")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="cursor-pointer" asChild>
              <Link href="/transactions">{t("viewAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <TransactionsTable
              transactions={recent}
              categories={categories}
              locale={locale}
              compact
              isDemo={isDemo}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
