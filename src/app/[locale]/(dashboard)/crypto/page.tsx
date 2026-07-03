import { getTranslations, setRequestLocale } from "next-intl/server";
import { CryptoPortfolio } from "@/components/features/crypto-portfolio";
import { getCryptoPortfolioData } from "@/lib/crypto/queries";

export default async function CryptoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("crypto");

  const { holdings, transactions, summary, totalInvestedEur, schemaReady, isDemo } =
    await getCryptoPortfolioData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <CryptoPortfolio
        holdings={holdings}
        transactions={transactions}
        summary={summary}
        totalInvestedEur={totalInvestedEur}
        locale={locale}
        isDemo={isDemo}
        schemaReady={schemaReady}
      />
    </div>
  );
}
