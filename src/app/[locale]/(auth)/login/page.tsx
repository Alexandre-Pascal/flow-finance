import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { GoogleSignInButton } from "@/components/features/google-sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppUser } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  setRequestLocale(locale);

  const user = await getAppUser();
  if (user) {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <TrendingUp className="size-6" aria-hidden />
        </div>
        <span className="text-2xl font-semibold tracking-tight">Flow Finance</span>
      </div>

      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="text-center">
          <CardTitle>{t("loginTitle")}</CardTitle>
          <CardDescription>{t("loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error === "auth" ? (
            <p className="mb-4 text-center text-sm text-destructive">{t("callbackError")}</p>
          ) : null}
          <GoogleSignInButton redirectTo={`/${locale}`} />
        </CardContent>
      </Card>
    </div>
  );
}
