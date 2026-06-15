import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const isFr = locale === "fr";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t("terms")}</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed text-muted-foreground">
        {isFr ? (
          <>
            <p>
              Flow Finance est fourni « en l&apos;état » à des fins personnelles.
              L&apos;utilisateur reste responsable de l&apos;usage de ses données
              financières.
            </p>
            <p>
              Le service ne constitue pas un conseil en investissement ni une
              offre bancaire.
            </p>
          </>
        ) : (
          <>
            <p>
              Flow Finance is provided &quot;as is&quot; for personal use. You
              remain responsible for how you use your financial data.
            </p>
            <p>
              This service does not constitute investment advice or a banking
              offer.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
