import { setRequestLocale } from "next-intl/server";
import { DemoBanner } from "@/components/features/demo-banner";
import { AppSidebar } from "@/components/features/app-sidebar";
import { MobileNav } from "@/components/features/mobile-nav";
import { getAppUser } from "@/lib/auth";
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        {user?.isDemo ? <DemoBanner /> : null}
        <header className="flex h-16 items-center border-b border-border px-4 md:px-6">
          <MobileNav />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
