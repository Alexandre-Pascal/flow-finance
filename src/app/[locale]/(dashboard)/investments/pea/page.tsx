import { setRequestLocale } from "next-intl/server";
import { PeaPortfolio } from "@/components/features/pea-portfolio";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { getPeaPortfolioData } from "@/lib/pea/queries";
import { redirect } from "@/i18n/navigation";

export default async function InvestmentsPeaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profileSettings = await getProfileSettings();
  if (!profileSettings.modules.investments) {
    redirect({ href: "/", locale });
  }

  const { holdings, transactions, plans, settings, summary, schemaReady, isDemo } =
    await getPeaPortfolioData();

  return (
    <PeaPortfolio
      holdings={holdings}
      transactions={transactions}
      plans={plans}
      settings={settings}
      summary={summary}
      locale={locale}
      isDemo={isDemo}
      schemaReady={schemaReady}
    />
  );
}
