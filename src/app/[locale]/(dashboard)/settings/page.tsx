import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/features/language-switcher";
import { SubscriptionsManager } from "@/components/features/subscriptions-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAppUser } from "@/lib/auth";
import { getFinanceData } from "@/lib/finance/queries";
import { listRecurringClusterSuggestions } from "@/lib/finance/recurring-suggestions";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ synced?: string; remapped?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { synced, remapped, error } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const tNav = await getTranslations("nav");
  const user = await getAppUser();
  const bankReady = isEnableBankingConfigured();
  const { accounts, bankConnection, transactions, recurringPayments, isDemo, subscriptionsSchemaReady } =
    await getFinanceData(locale);
  const recurringSuggestions = listRecurringClusterSuggestions(
    transactions,
    recurringPayments,
  );

  const hasSyncedAccounts = accounts.length > 0;
  const isBankLinked =
    bankConnection?.status === "active" || hasSyncedAccounts;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {synced ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
          {remapped
            ? t("syncSuccessWithRemap", {
                count: Number(synced),
                remapped: Number(remapped),
              })
            : t("syncSuccess", { count: Number(synced) })}
        </p>
      ) : null}
      {error === "sync" ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("syncError")}
        </p>
      ) : null}

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

      <SubscriptionsManager
        subscriptions={recurringPayments}
        suggestions={recurringSuggestions}
        locale={locale}
        isDemo={isDemo}
        schemaReady={subscriptionsSchemaReady}
      />

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
