import { getTranslations, setRequestLocale } from "next-intl/server";
import { TransactionsTable } from "@/components/features/transactions-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinanceData } from "@/lib/finance/queries";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { getConfiguredIncomeSources } from "@/lib/profile-settings";

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("transactions");

  const [
    {
      accounts,
      allAccounts,
      transactions,
      categories,
      savingsAccounts,
      peaInvestmentPlans,
      recurringPayments,
      spaces,
      isDemo,
    },
    profileSettings,
  ] = await Promise.all([
    getFinanceData(locale, {
      savingsAdjustments: false,
      dismissedSuggestions: false,
      bankConnection: false,
    }),
    getProfileSettings(),
  ]);

  const sorted = [...transactions].sort((a, b) =>
    b.booking_date.localeCompare(a.booking_date),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <TransactionsTable
            transactions={sorted}
            categories={categories}
            locale={locale}
            savingsAccounts={savingsAccounts}
            peaInvestmentPlans={peaInvestmentPlans}
            recurringPayments={recurringPayments}
            accounts={accounts}
            transferAccounts={allAccounts}
            spaces={spaces}
            incomeSources={getConfiguredIncomeSources(profileSettings)}
            payrollKeyword={profileSettings.payroll.keyword}
            isDemo={isDemo}
          />
        </CardContent>
      </Card>
    </div>
  );
}
