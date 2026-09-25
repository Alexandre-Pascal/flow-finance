import { getTranslations, setRequestLocale } from "next-intl/server";
import { MonthlyAnalytics } from "@/components/features/monthly-analytics";
import {
  SpendingFlowPanel,
  type SpendingFlowIncomeSeries,
} from "@/components/features/spending-flow-panel";
import { buildMonthlyOverview } from "@/lib/finance/aggregates";
import { buildCategoryBreakdown } from "@/lib/finance/category-analytics";
import { buildContributionFlow } from "@/lib/finance/contribution-flow";
import { getFinanceData } from "@/lib/finance/queries";
import { getProfileSettings } from "@/lib/get-profile-settings";
import {
  buildMonthlySubscriptionOverview,
} from "@/lib/finance/recurring-payments";
import {
  buildMonthlyTransferOverview,
  isPayrollTransfer,
  isTrackedIncomeTransfer,
  isTrackedOutgoingTransfer,
} from "@/lib/finance/tracked-transfers";
import {
  getConfiguredIncomeSources,
  getConfiguredOutgoingPeople,
  isPayrollConfigured,
  isTrackedOutgoingConfigured,
  isTrackedPersonConfigured,
} from "@/lib/profile-settings";

/** Couleurs des rentrées suivies dans le Sankey, dans l'ordre de configuration. */
const INCOME_SOURCE_COLORS = ["#0F766E", "#7C3AED", "#B45309", "#0E7490"];

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCategories, tFlow] = await Promise.all([
    getTranslations("analytics"),
    getTranslations("categoryAnalytics"),
    getTranslations("spendingFlow"),
  ]);

  const [
    { transactions, recurringPayments, savingsAccounts },
    profileSettings,
  ] =
    await Promise.all([
      getFinanceData(locale, {
        savingsAdjustments: false,
        dismissedSuggestions: false,
        bankConnection: false,
      }),
      getProfileSettings(),
    ]);

  const payrollOptions = {
    payrollKeyword: profileSettings.payroll.keyword,
    budgetShiftMonths: profileSettings.payroll.budgetShiftMonths,
    incomeSources: getConfiguredIncomeSources(profileSettings),
  };

  const monthlyOverview = buildMonthlyOverview(
    transactions,
    locale,
    payrollOptions,
  );

  const showTrackedPerson = isTrackedPersonConfigured(profileSettings);
  const showPayroll = isPayrollConfigured(profileSettings);
  const showTrackedOutgoing = isTrackedOutgoingConfigured(profileSettings);
  const incomeSources = getConfiguredIncomeSources(profileSettings);
  const outgoingPeople = getConfiguredOutgoingPeople(profileSettings);

  const incomeTransferSeries = incomeSources.map((source) => ({
    source,
    data: buildMonthlyTransferOverview(transactions, locale, (tx) =>
      isTrackedIncomeTransfer(tx, source),
    ),
  }));

  const payrollTransferData = showPayroll
    ? buildMonthlyTransferOverview(
        transactions,
        locale,
        (tx) => isPayrollTransfer(tx, profileSettings.payroll.keyword),
        { budgetMonthShift: profileSettings.payroll.budgetShiftMonths },
      )
    : [];

  const outgoingTransferSeries = outgoingPeople.map((person) => ({
    person,
    data: buildMonthlyTransferOverview(
      transactions,
      locale,
      (tx) => isTrackedOutgoingTransfer(tx, person.keyword),
      { absoluteAmounts: true },
    ),
  }));

  const subscriptionData = buildMonthlySubscriptionOverview(
    transactions,
    recurringPayments,
    locale,
  );

  // Le Sankey réutilise les agrégats existants : catégories de dépenses,
  // abonnements ligne à ligne et versements d'épargne par enveloppe.
  const categoryBreakdown = buildCategoryBreakdown(transactions, locale, {
    subscriptions: tCategories("subscriptions"),
    uncategorized: tCategories("uncategorized"),
    spaceTransfer: tCategories("spaceTransfer"),
  });
  const contribution = buildContributionFlow(
    transactions,
    savingsAccounts,
    locale,
  );

  const flowIncomeSeries: SpendingFlowIncomeSeries[] = [
    ...(showPayroll
      ? [
          {
            key: "__payroll__",
            name: tFlow("salary"),
            color: "#1E3A8A",
            data: payrollTransferData,
          },
        ]
      : []),
    ...incomeTransferSeries.map((series, index) => ({
      key: series.source.id,
      name: series.source.label,
      color: INCOME_SOURCE_COLORS[index % INCOME_SOURCE_COLORS.length],
      data: series.data,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SpendingFlowPanel
        breakdown={categoryBreakdown}
        monthlyOverview={monthlyOverview}
        incomeSeries={flowIncomeSeries}
        subscriptionRows={subscriptionData}
        contribution={contribution}
        locale={locale}
      />

      <MonthlyAnalytics
        data={monthlyOverview}
        incomeTransferSeries={incomeTransferSeries}
        payrollTransferData={payrollTransferData}
        outgoingTransferSeries={outgoingTransferSeries}
        subscriptionData={subscriptionData}
        subscriptions={recurringPayments}
        transactions={transactions}
        locale={locale}
        showTrackedPerson={showTrackedPerson}
        showPayroll={showPayroll}
        showTrackedOutgoing={showTrackedOutgoing}
        payrollKeyword={profileSettings.payroll.keyword}
        payrollBudgetShiftMonths={profileSettings.payroll.budgetShiftMonths}
      />
    </div>
  );
}
