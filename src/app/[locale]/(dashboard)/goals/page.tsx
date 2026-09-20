import { getTranslations, setRequestLocale } from "next-intl/server";
import { SavingsGoalsManager } from "@/components/features/savings-goals-manager";
import { getFinanceData } from "@/lib/finance/queries";
import { buildSavingsOverview } from "@/lib/finance/savings";
import {
  buildSavingsGoalsOverview,
  peaFundingSource,
  savingsFundingSource,
  type GoalFundingSource,
} from "@/lib/finance/savings-goals";
import { getSavingsGoalsData } from "@/lib/finance/savings-goals-queries";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { getPeaPortfolioData } from "@/lib/pea/queries";
import { redirect } from "@/i18n/navigation";

export default async function GoalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Les objectifs se financent sur les livrets : sans module épargne, pas de page.
  const profileSettings = await getProfileSettings();
  if (!profileSettings.modules.savings) {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations("goals");

  const [
    { transactions, savingsAccounts, savingsAdjustments, isDemo },
    { goals, allocations, schemaReady },
    pea,
  ] = await Promise.all([
    getFinanceData(locale, {
      dismissedSuggestions: false,
      bankConnection: false,
    }),
    getSavingsGoalsData(),
    getPeaPortfolioData(),
  ]);

  // Les soldes viennent de la même reconstruction que la page Épargne.
  const savings = buildSavingsOverview(
    transactions,
    savingsAccounts,
    savingsAdjustments,
    locale,
  );

  const sources: GoalFundingSource[] = savings.vehicles.map((vehicle) =>
    savingsFundingSource(vehicle.account, vehicle.balance),
  );

  // Le PEA ne se propose qu'une fois alimenté, et si le module est actif.
  if (
    profileSettings.modules.investments &&
    pea.schemaReady &&
    pea.summary.totalValueEur > 0
  ) {
    sources.push(
      peaFundingSource(t("peaSourceName"), pea.summary.totalValueEur),
    );
  }

  const overview = buildSavingsGoalsOverview(goals, allocations, sources);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SavingsGoalsManager
        overview={overview}
        locale={locale}
        isDemo={isDemo}
        schemaReady={schemaReady || isDemo}
      />
    </div>
  );
}
