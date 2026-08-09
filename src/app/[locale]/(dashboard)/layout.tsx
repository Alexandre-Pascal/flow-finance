import { setRequestLocale } from "next-intl/server";
import { DemoBanner } from "@/components/features/demo-banner";
import { AppSidebar } from "@/components/features/app-sidebar";
import { MobileNav } from "@/components/features/mobile-nav";
import { getAppUser } from "@/lib/auth";
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

  const profileSettings = await getProfileSettings();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        showSavings={profileSettings.modules.savings}
        showInvestments={profileSettings.modules.investments}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        {user?.isDemo ? <DemoBanner /> : null}
        <header className="flex h-16 items-center border-b border-border px-4 md:px-6">
          <MobileNav
            showSavings={profileSettings.modules.savings}
            showInvestments={profileSettings.modules.investments}
          />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
