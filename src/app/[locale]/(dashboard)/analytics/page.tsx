import { getTranslations, setRequestLocale } from "next-intl/server";
import { MonthlyAnalytics } from "@/components/features/monthly-analytics";
import { buildMonthlyOverview } from "@/lib/finance/aggregates";
import { getFinanceData } from "@/lib/finance/queries";
import {
  buildMonthlySubscriptionOverview,
} from "@/lib/finance/recurring-payments";
import {
  buildMonthlyTransferOverview,
  isMotherTransfer,
} from "@/lib/finance/tracked-transfers";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("analytics");

  const { transactions, recurringPayments } = await getFinanceData(locale);
  const monthlyOverview = buildMonthlyOverview(transactions, locale);
  const motherTransferData = buildMonthlyTransferOverview(
    transactions,
    locale,
    isMotherTransfer,
  );
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
        subscriptionData={subscriptionData}
        subscriptions={recurringPayments}
        transactions={transactions}
        locale={locale}
      />
    </div>
  );
}
