import { getTranslations, setRequestLocale } from "next-intl/server";
import { SavingsAnalytics } from "@/components/features/savings-analytics";
import { getFinanceData } from "@/lib/finance/queries";
import { buildSavingsOverview } from "@/lib/finance/savings";

export default async function SavingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("savings");

  const { transactions } = await getFinanceData(locale);
  const overview = buildSavingsOverview(transactions, locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SavingsAnalytics overview={overview} locale={locale} />
    </div>
  );
}
