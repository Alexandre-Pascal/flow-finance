import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/features/language-switcher";
import { BankConnectButtons } from "@/components/features/bank-connect-buttons";
import { BankSyncButtons } from "@/components/features/bank-sync-buttons";
import { SpacesManager } from "@/components/features/spaces-manager";
import { CategoriesManager } from "@/components/features/categories-manager";
import { ProfileSettingsForm } from "@/components/features/profile-settings-form";
import { SubscriptionsManager } from "@/components/features/subscriptions-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAppUser } from "@/lib/auth";
import { getFinanceData } from "@/lib/finance/queries";
import { getProfileSettings } from "@/lib/get-profile-settings";
import { listRecurringClusterSuggestions } from "@/lib/finance/recurring-suggestions";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    synced?: string;
    remapped?: string;
    connected?: string;
    error?: string;
  }>;
}) {
  const { locale } = await params;
  const { synced, remapped, connected, error } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const tNav = await getTranslations("nav");
  const user = await getAppUser();
  const bankReady = isEnableBankingConfigured();
  const [
    {
      accounts,
      bankConnection,
      bankConnections,
      spaces,
      transactions,
      recurringPayments,
      categories,
      dismissedSuggestionKeys,
      isDemo,
      subscriptionsSchemaReady,
      categoriesSchemaReady,
    },
    profileSettings,
  ] = await Promise.all([
    getFinanceData(locale, { savingsAdjustments: false }),
    getProfileSettings(),
  ]);
  const recurringSuggestions = listRecurringClusterSuggestions(
    transactions,
    recurringPayments,
    dismissedSuggestionKeys,
  );
  const paypalSuggestions = recurringSuggestions.filter(
    (suggestion) => suggestion.source === "paypal",
  );
  const generalSuggestions = recurringSuggestions.filter(
    (suggestion) => suggestion.source === "general",
  );

  const hasSyncedAccounts = accounts.length > 0;
  const isBankLinked =
    bankConnection?.status === "active" || hasSyncedAccounts;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {connected ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
          {t("connectSuccess")}
        </p>
      ) : null}
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
      {error === "auth" ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("connectAuthError")}
        </p>
      ) : null}
      {error === "no_accounts" ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("connectNoAccountsError")}
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
          <CardTitle className="text-base">{t("spacesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SpacesManager
            spaces={spaces}
            accounts={accounts}
            locale={locale}
            isDemo={isDemo}
          />
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
          {bankConnections.length > 0 ? (
            <ul className="space-y-1">
              {bankConnections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted-foreground"
                >
                  <span>
                    {connection.aspsp_name
                      ? t("aspspConnected", { name: connection.aspsp_name })
                      : t("bankConnected")}
                  </span>
                  {connection.valid_until ? (
                    <span className="text-xs">
                      {t("consentExpires", {
                        date: new Date(
                          connection.valid_until,
                        ).toLocaleDateString(locale),
                      })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {isBankLinked && !hasSyncedAccounts ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {t("connectNoAccountsError")}
            </p>
          ) : null}
          {/* Toujours proposé : on peut relier une seconde banque. */}
          {bankReady ? (
            <BankConnectButtons
              connected={isBankLinked && hasSyncedAccounts}
            />
          ) : null}
          {bankReady && isBankLinked && hasSyncedAccounts ? (
            <BankSyncButtons />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profilePreferences")}</CardTitle>
          <CardDescription>{t("profilePreferencesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileSettingsForm settings={profileSettings} isDemo={isDemo} />
        </CardContent>
      </Card>

      <SubscriptionsManager
        subscriptions={recurringPayments}
        paypalSuggestions={paypalSuggestions}
        generalSuggestions={generalSuggestions}
        locale={locale}
        isDemo={isDemo}
        schemaReady={subscriptionsSchemaReady}
      />

      <CategoriesManager
        categories={categories}
        isDemo={isDemo}
        schemaReady={categoriesSchemaReady}
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
