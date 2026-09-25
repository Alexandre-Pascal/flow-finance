import { setRequestLocale } from "next-intl/server";
import { DemoBanner } from "@/components/features/demo-banner";
import { AppSidebar } from "@/components/features/app-sidebar";
import { SpaceSwitcher } from "@/components/features/space-switcher";
import { MobileNav } from "@/components/features/mobile-nav";
import { getAppUser } from "@/lib/auth";
import { getActiveSpace, getSpaces } from "@/lib/get-active-space";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { redirect } from "@/i18n/navigation";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getAppUser();

  if (!user && isSupabaseConfigured()) {
    redirect({ href: "/login", locale });
  }

  const [profileSettings, spaces, activeSpace] = await Promise.all([
    getProfileSettings(),
    getSpaces(),
    getActiveSpace(),
  ]);

  // La page Épargne reste accessible partout : c'est la seule qui liste les
  // comptes, et un espace partagé en a besoin. Elle s'y réduit d'elle-même aux
  // comptes. Le PEA et la crypto, eux, sont personnels.
  const isShared = activeSpace?.kind === "shared";
  const showSavings = profileSettings.modules.savings;
  const showInvestments = profileSettings.modules.investments && !isShared;
  const showGoals = profileSettings.modules.savings && !isShared;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        showSavings={showSavings}
        showInvestments={showInvestments}
        showGoals={showGoals}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        {user?.isDemo ? <DemoBanner /> : null}
        <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-6">
          <MobileNav
            showSavings={showSavings}
            showInvestments={showInvestments}
            showGoals={showGoals}
          />
          <SpaceSwitcher
            spaces={spaces}
            activeSpaceId={activeSpace?.id ?? null}
          />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
