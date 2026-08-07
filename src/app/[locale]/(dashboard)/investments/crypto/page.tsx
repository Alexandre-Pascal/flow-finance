import { setRequestLocale } from "next-intl/server";
import { CryptoPortfolio } from "@/components/features/crypto-portfolio";
import { getCryptoPortfolioData } from "@/lib/crypto/queries";

export default async function InvestmentsCryptoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { holdings, transactions, summary, totalInvestedEur, schemaReady, isDemo } =
    await getCryptoPortfolioData();

  return (
    <CryptoPortfolio
      holdings={holdings}
      transactions={transactions}
      summary={summary}
      totalInvestedEur={totalInvestedEur}
      locale={locale}
      isDemo={isDemo}
      schemaReady={schemaReady}
    />
  );
}
