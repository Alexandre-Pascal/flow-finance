import { getTranslations, setRequestLocale } from "next-intl/server";
import { TransactionsTable } from "@/components/features/transactions-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinanceData } from "@/lib/finance/queries";

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("transactions");

  const { transactions, categories, isDemo } = await getFinanceData(locale);

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
            isDemo={isDemo}
          />
        </CardContent>
      </Card>
    </div>
  );
}
