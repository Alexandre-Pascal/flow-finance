/**
 * @file profile-settings-form.tsx
 * @description Modules visibles + mots-clés salaire / personne suivie.
 */

"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateProfileSettingsAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileSettings } from "@/lib/profile-settings";

interface ProfileSettingsFormProps {
  settings: ProfileSettings;
  isDemo: boolean;
}

export function ProfileSettingsForm({
  settings,
  isDemo,
}: ProfileSettingsFormProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState(settings.modules);
  const [payrollKeyword, setPayrollKeyword] = useState(
    settings.payroll.keyword ?? "",
  );
  const [payrollShift, setPayrollShift] = useState<0 | 1>(
    settings.payroll.budgetShiftMonths,
  );
  const [trackedKeyword, setTrackedKeyword] = useState(
    settings.trackedPerson.keyword ?? "",
  );
  const [trackedLabel, setTrackedLabel] = useState(
    settings.trackedPerson.label ?? "",
  );

  function toggleModule(key: keyof ProfileSettings["modules"]) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDemo) {
      setError(t("profileDemoError"));
      return;
    }

    setError(null);
    const formData = new FormData();
    formData.set("module_savings", modules.savings ? "1" : "0");
    formData.set("module_investments", modules.investments ? "1" : "0");
    formData.set("module_payroll", modules.payroll ? "1" : "0");
    formData.set("module_tracked_person", modules.trackedPerson ? "1" : "0");
    formData.set("payroll_keyword", payrollKeyword);
    formData.set("payroll_shift", String(payrollShift));
    formData.set("tracked_person_keyword", trackedKeyword);
    formData.set("tracked_person_label", trackedLabel);

    startTransition(async () => {
      const result = await updateProfileSettingsAction(formData);
      if (result.error === "schema") {
        setError(t("profileSchemaError"));
        return;
      }
      if (result.error) {
        setError(t("profileSaveError"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">{t("modulesTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("modulesDescription")}</p>
        <div className="space-y-2">
          {(
            [
              ["savings", modules.savings],
              ["investments", modules.investments],
              ["payroll", modules.payroll],
              ["trackedPerson", modules.trackedPerson],
            ] as const
          ).map(([key, enabled]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>{t(`module_${key}`)}</span>
              <input
                type="checkbox"
                className="size-4 cursor-pointer"
                checked={enabled}
                disabled={isDemo || isPending}
                onChange={() => toggleModule(key)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">{t("payrollTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("payrollDescription")}</p>
        <div className="space-y-2">
          <Label htmlFor="payroll-keyword">{t("payrollKeywordLabel")}</Label>
          <Input
            id="payroll-keyword"
            value={payrollKeyword}
            onChange={(event) => setPayrollKeyword(event.target.value)}
            placeholder={t("payrollKeywordPlaceholder")}
            disabled={isDemo || isPending}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("payrollShiftLabel")}</Label>
          <div className="flex w-fit rounded-md border border-border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={payrollShift === 0 ? "default" : "ghost"}
              className="h-7 cursor-pointer px-3 text-xs"
              disabled={isDemo || isPending}
              onClick={() => setPayrollShift(0)}
            >
              {t("payrollShift0")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={payrollShift === 1 ? "default" : "ghost"}
              className="h-7 cursor-pointer px-3 text-xs"
              disabled={isDemo || isPending}
              onClick={() => setPayrollShift(1)}
            >
              {t("payrollShift1")}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">
          {t("trackedPersonTitle")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("trackedPersonDescription")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="tracked-label">{t("trackedPersonLabelLabel")}</Label>
          <Input
            id="tracked-label"
            value={trackedLabel}
            onChange={(event) => setTrackedLabel(event.target.value)}
            placeholder={t("trackedPersonLabelPlaceholder")}
            disabled={isDemo || isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tracked-keyword">{t("trackedPersonKeywordLabel")}</Label>
          <Input
            id="tracked-keyword"
            value={trackedKeyword}
            onChange={(event) => setTrackedKeyword(event.target.value)}
            placeholder={t("trackedPersonKeywordPlaceholder")}
            disabled={isDemo || isPending}
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="cursor-pointer" disabled={isDemo || isPending}>
        {t("profileSave")}
      </Button>
    </form>
  );
}
