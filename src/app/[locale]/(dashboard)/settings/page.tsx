import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/features/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAppUser } from "@/lib/auth";
import { getFinanceData } from "@/lib/finance/queries";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const tNav = await getTranslations("nav");
  const user = await getAppUser();
  const bankReady = isEnableBankingConfigured();
  const { accounts, bankConnection } = await getFinanceData(locale);

  const hasSyncedAccounts = accounts.length > 0;
  const isBankLinked =
    bankConnection?.status === "active" || hasSyncedAccounts;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("language")}</CardTitle>
          <CardDescription>{t("languageDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bankConnection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("bankStatus")}</span>
            <span className="font-medium">
              {isBankLinked ? t("bankConnected") : t("bankNotConnected")}
            </span>
          </div>
          {bankConnection?.valid_until ? (
            <p className="text-sm text-muted-foreground">
              {t("consentExpires", {
                date: new Date(bankConnection.valid_until).toLocaleDateString(
                  locale,
                ),
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {bankReady && !isBankLinked ? (
              <form action="/api/bank/connect" method="get">
                <Button
                  type="submit"
                  className="cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {t("connectBank")}
                </Button>
              </form>
            ) : null}
            {bankReady && isBankLinked ? (
              <form action="/api/bank/sync" method="post">
                <Button
                  type="submit"
                  variant="outline"
                  className="cursor-pointer"
                >
                  {t("syncNow")}
                </Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("email")}</span>
            <span className="font-medium">{user?.email ?? "—"}</span>
          </div>
          <Separator />
          {isSupabaseConfigured() && !user?.isDemo ? (
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" className="cursor-pointer">
                {tNav("logout")}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
