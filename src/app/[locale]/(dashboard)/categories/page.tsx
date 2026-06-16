import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryAnalytics } from "@/components/features/category-analytics";
import { buildCategoryBreakdown } from "@/lib/finance/category-analytics";
import { getFinanceData } from "@/lib/finance/queries";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("categoryAnalytics");

  const { transactions } = await getFinanceData(locale);
  const breakdown = buildCategoryBreakdown(transactions, locale, {
    subscriptions: t("subscriptions"),
    uncategorized: t("uncategorized"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <CategoryAnalytics breakdown={breakdown} locale={locale} />
    </div>
  );
}
