import { getActiveSpace } from "@/lib/get-active-space";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { redirect } from "@/i18n/navigation";

export default async function InvestmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const profileSettings = await getProfileSettings();
  if (!profileSettings.modules.investments || (await getActiveSpace())?.kind === "shared") {
    redirect({ href: "/", locale });
  }
  redirect({ href: "/investments/pea", locale });
}
