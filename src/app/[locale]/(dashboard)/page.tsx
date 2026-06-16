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
import { getFinanceData } from "@/lib/finance/queries";
import { formatCurrency } from "@/lib/format";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const { accounts, transactions, monthlySpending } = await getFinanceData(locale);

  const totalBalance = sumAccountBalances(accounts);
  const monthTx = getCurrentMonthTransactions(transactions);
  const spending = monthTx
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const income = monthTx
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

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
              locale={locale}
              compact
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
