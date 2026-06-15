import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function PrivacyPage({
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
      <h1 className="text-3xl font-semibold tracking-tight">{t("privacy")}</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed text-muted-foreground">
        {isFr ? (
          <>
            <p>
              Flow Finance est une application personnelle de suivi de comptes
              bancaires. Vos données sont stockées de manière sécurisée via
              Supabase et ne sont jamais revendues.
            </p>
            <p>
              La connexion bancaire utilise Enable Banking (Open Banking DSP2) en
              lecture seule. Nous ne stockons pas vos identifiants bancaires.
            </p>
            <p>
              Pour toute question : contactez le responsable du projet via le
              dépôt GitHub.
            </p>
          </>
        ) : (
          <>
            <p>
              Flow Finance is a personal banking tracker. Your data is stored
              securely via Supabase and is never sold.
            </p>
            <p>
              Bank connection uses Enable Banking (PSD2 Open Banking) in
              read-only mode. We never store your bank credentials.
            </p>
            <p>
              For questions, contact the project owner via the GitHub repository.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
