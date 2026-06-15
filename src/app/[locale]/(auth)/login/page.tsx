import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { LoginForm } from "@/components/features/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppUser } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
          <LoginForm redirectTo={`/${locale}`} />
        </CardContent>
      </Card>
    </div>
  );
}
