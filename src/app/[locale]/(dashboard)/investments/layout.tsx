import { getTranslations, setRequestLocale } from "next-intl/server";
import { InvestmentsTabs } from "@/components/features/investments-tabs";

export default async function InvestmentsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("investments");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <InvestmentsTabs />

      {children}
    </div>
  );
}
