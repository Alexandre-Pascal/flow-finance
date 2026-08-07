import { redirect } from "@/i18n/navigation";

/** L'onglet Crypto a rejoint la section Investissements. */
export default async function CryptoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/investments/crypto", locale });
}
