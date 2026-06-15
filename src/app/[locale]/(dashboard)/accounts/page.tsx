import { getTranslations, setRequestLocale } from "next-intl/server";
import { PiggyBank, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, maskIban } from "@/lib/format";
import { MOCK_ACCOUNTS } from "@/lib/mock-data";
import { isEnableBankingConfigured } from "@/lib/enable-banking/jwt";

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("accounts");

  const bankReady = isEnableBankingConfigured();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Button
          disabled={!bankReady}
          className="cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed"
          asChild={bankReady}
        >
          {bankReady ? (
            <a href="/api/bank/connect">{t("connectBank")}</a>
          ) : (
            <span>{t("connectBank")}</span>
          )}
        </Button>
      </div>

      {!bankReady ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {t("connectBankSoon")}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {MOCK_ACCOUNTS.map((account) => {
          const Icon = account.type === "savings" ? PiggyBank : Wallet;
          const typeLabel =
            account.type === "savings" ? t("savings") : t("checking");

          return (
            <Card
              key={account.id}
              className="transition-shadow duration-200 hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-base">{account.name}</CardTitle>
                    <Badge variant="secondary" className="mt-1">
                      {typeLabel}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(account.balance, locale, account.currency)}
                </p>
                {account.iban ? (
                  <p className="text-sm text-muted-foreground">
                    {t("iban")}: {maskIban(account.iban)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
