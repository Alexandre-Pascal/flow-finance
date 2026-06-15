/**
 * @file login-form.tsx
 * @description Formulaire de connexion par magic link Supabase.
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/client";

interface LoginFormProps {
  redirectTo: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!isSupabaseConfigured()) {
      window.location.href = redirectTo;
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (error) throw error;
      setSent(true);
      toast.success(t("checkEmail"));
    } catch {
      toast.error(t("loginError"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="text-center text-sm text-muted-foreground">{t("checkEmail")}</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          type="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <Button
        type="submit"
        className="w-full cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90"
        disabled={loading}
      >
        {loading ? "…" : t("sendLink")}
      </Button>
    </form>
  );
}
