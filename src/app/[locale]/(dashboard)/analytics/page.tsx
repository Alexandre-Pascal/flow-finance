import { getTranslations, setRequestLocale } from "next-intl/server";
import { MonthlyAnalytics } from "@/components/features/monthly-analytics";
import { buildMonthlyOverview } from "@/lib/finance/aggregates";
import { getFinanceData } from "@/lib/finance/queries";
import { getProfileSettings } from "@/lib/get-profile-settings";
import {
  buildMonthlySubscriptionOverview,
} from "@/lib/finance/recurring-payments";
import {
  buildMonthlyTransferOverview,
  isPayrollTransfer,
  isTrackedOutgoingTransfer,
  isTrackedPersonTransfer,
} from "@/lib/finance/tracked-transfers";
import {
  getConfiguredOutgoingPeople,
  isPayrollConfigured,
  isTrackedOutgoingConfigured,
  isTrackedPersonConfigured,
} from "@/lib/profile-settings";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("analytics");

  const [{ transactions, recurringPayments }, profileSettings] =
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
  };

  const monthlyOverview = buildMonthlyOverview(
    transactions,
    locale,
    payrollOptions,
  );

  const showTrackedPerson = isTrackedPersonConfigured(profileSettings);
  const showPayroll = isPayrollConfigured(profileSettings);
  const showTrackedOutgoing = isTrackedOutgoingConfigured(profileSettings);
  const outgoingPeople = getConfiguredOutgoingPeople(profileSettings);

  const motherTransferData = showTrackedPerson
    ? buildMonthlyTransferOverview(transactions, locale, (tx) =>
        isTrackedPersonTransfer(tx, profileSettings.trackedPerson.keyword),
      )
    : [];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <MonthlyAnalytics
        data={monthlyOverview}
        motherTransferData={motherTransferData}
        payrollTransferData={payrollTransferData}
        outgoingTransferSeries={outgoingTransferSeries}
        subscriptionData={subscriptionData}
        subscriptions={recurringPayments}
        transactions={transactions}
        locale={locale}
        showTrackedPerson={showTrackedPerson}
        showPayroll={showPayroll}
        showTrackedOutgoing={showTrackedOutgoing}
        trackedPersonKeyword={profileSettings.trackedPerson.keyword}
        trackedPersonLabel={profileSettings.trackedPerson.label}
        payrollKeyword={profileSettings.payroll.keyword}
        payrollBudgetShiftMonths={profileSettings.payroll.budgetShiftMonths}
      />
    </div>
  );
}
