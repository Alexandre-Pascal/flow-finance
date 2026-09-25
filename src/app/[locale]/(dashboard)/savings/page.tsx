import { getTranslations, setRequestLocale } from "next-intl/server";
import { SavingsAnalytics } from "@/components/features/savings-analytics";
import { getCryptoPortfolioData } from "@/lib/crypto/queries";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { getFinanceData } from "@/lib/finance/queries";
import {
  buildCheckingOverview,
  buildSavingsOverview,
} from "@/lib/finance/savings";
import { getActiveSpace } from "@/lib/get-active-space";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { getPeaPortfolioData } from "@/lib/pea/queries";
import { redirect } from "@/i18n/navigation";

export default async function SavingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profileSettings = await getProfileSettings();
  if (!profileSettings.modules.savings || (await getActiveSpace())?.kind === "shared") {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations("savings");

  // Les portefeuilles crypto et PEA ne dépendent pas des données bancaires :
  // les trois lectures partent ensemble au lieu de s'enchaîner.
  const [
    {
      accounts,
      transactions,
      savingsAccounts,
      savingsAdjustments,
      savingsSchemaReady,
      bankConnection,
      isDemo,
    },
    crypto,
    pea,
  ] = await Promise.all([
    getFinanceData(locale, { dismissedSuggestions: false }),
    getCryptoPortfolioData(),
    getPeaPortfolioData(),
  ]);

  const overview = buildSavingsOverview(
    transactions,
    savingsAccounts,
    savingsAdjustments,
    locale,
  );
  const checking = buildCheckingOverview(accounts, transactions, locale);

  const bankReady = isEnableBankingConfigured();
  const isBankLinked =
    bankConnection?.status === "active" || accounts.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SavingsAnalytics
        overview={overview}
        checking={checking}
        crypto={{
          summary: crypto.summary,
          schemaReady: crypto.schemaReady,
        }}
        pea={{
          summary: pea.summary,
          schemaReady: pea.schemaReady,
        }}
        transactions={transactions}
        locale={locale}
        isDemo={isDemo}
        schemaReady={savingsSchemaReady}
        showConnectBank={bankReady && !isBankLinked}
        bankConfigured={bankReady}
      />
    </div>
  );
}
