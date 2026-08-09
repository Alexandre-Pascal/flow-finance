/**
 * @file profile-settings-form.tsx
 * @description Modules visibles + mots-clés salaire / rentrées / virements émis.
 */

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateProfileSettingsAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ProfileSettings,
  ProfileTrackedIncomeSource,
  ProfileTrackedOutgoingPerson,
} from "@/lib/profile-settings";

interface ProfileSettingsFormProps {
  settings: ProfileSettings;
  isDemo: boolean;
}

interface IncomeSourceDraft {
  id: string;
  label: string;
  keywordsText: string;
  excludeKeywordsText: string;
  requireRoundAmount: boolean;
}

function newOutgoingPerson(): ProfileTrackedOutgoingPerson {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    keyword: "",
  };
}

function newIncomeSource(): IncomeSourceDraft {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    keywordsText: "",
    excludeKeywordsText: "",
    requireRoundAmount: true,
  };
}

function toIncomeDraft(source: ProfileTrackedIncomeSource): IncomeSourceDraft {
  return {
    id: source.id,
    label: source.label,
    keywordsText: source.keywords.join("\n"),
    excludeKeywordsText: source.excludeKeywords.join("\n"),
    requireRoundAmount: source.requireRoundAmount,
  };
}

function parseLines(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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
  const [incomeSources, setIncomeSources] = useState<IncomeSourceDraft[]>(
    settings.trackedIncomeSources.length > 0
      ? settings.trackedIncomeSources.map(toIncomeDraft)
      : [],
  );
  const [outgoingPeople, setOutgoingPeople] = useState<
    ProfileTrackedOutgoingPerson[]
  >(
    settings.trackedOutgoingPeople.length > 0
      ? settings.trackedOutgoingPeople
      : [],
  );

  function toggleModule(key: keyof ProfileSettings["modules"]) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function updateOutgoingPerson(
    id: string,
    patch: Partial<Pick<ProfileTrackedOutgoingPerson, "label" | "keyword">>,
  ) {
    setOutgoingPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, ...patch } : person,
      ),
    );
  }

  function updateIncomeSource(
    id: string,
    patch: Partial<Omit<IncomeSourceDraft, "id">>,
  ) {
    setIncomeSources((prev) =>
      prev.map((source) =>
        source.id === id ? { ...source, ...patch } : source,
      ),
    );
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
    formData.set("module_tracked_outgoing", modules.trackedOutgoing ? "1" : "0");
    formData.set("payroll_keyword", payrollKeyword);
    formData.set("payroll_shift", String(payrollShift));
    formData.set(
      "tracked_income_sources",
      JSON.stringify(
        incomeSources
          .map((source) => ({
            id: source.id,
            label: source.label.trim(),
            keywords: parseLines(source.keywordsText),
            excludeKeywords: parseLines(source.excludeKeywordsText),
            requireRoundAmount: source.requireRoundAmount,
          }))
          .filter((source) => source.keywords.length > 0),
      ),
    );
    formData.set(
      "tracked_outgoing_people",
      JSON.stringify(
        outgoingPeople.filter(
          (person) => person.keyword.trim().length > 0,
        ),
      ),
    );

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
              ["trackedOutgoing", modules.trackedOutgoing],
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
          {t("trackedIncomeTitle")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("trackedIncomeDescription")}
        </p>

        {incomeSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("trackedIncomeEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {incomeSources.map((source, index) => (
              <li
                key={source.id}
                className="space-y-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {t("trackedIncomeSourceTitle", { index: index + 1 })}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer text-muted-foreground hover:text-destructive"
                    disabled={isDemo || isPending}
                    onClick={() =>
                      setIncomeSources((prev) =>
                        prev.filter((row) => row.id !== source.id),
                      )
                    }
                    aria-label={t("trackedIncomeRemove")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`income-label-${source.id}`}>
                    {t("trackedIncomeLabelLabel")}
                  </Label>
                  <Input
                    id={`income-label-${source.id}`}
                    value={source.label}
                    onChange={(event) =>
                      updateIncomeSource(source.id, {
                        label: event.target.value,
                      })
                    }
                    placeholder={t("trackedIncomeLabelPlaceholder")}
                    disabled={isDemo || isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`income-keywords-${source.id}`}>
                    {t("trackedIncomeKeywordsLabel")}
                  </Label>
                  <textarea
                    id={`income-keywords-${source.id}`}
                    value={source.keywordsText}
                    onChange={(event) =>
                      updateIncomeSource(source.id, {
                        keywordsText: event.target.value,
                      })
                    }
                    placeholder={t("trackedIncomeKeywordsPlaceholder")}
                    disabled={isDemo || isPending}
                    rows={3}
                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("trackedIncomeKeywordsHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`income-exclude-${source.id}`}>
                    {t("trackedIncomeExcludeLabel")}
                  </Label>
                  <textarea
                    id={`income-exclude-${source.id}`}
                    value={source.excludeKeywordsText}
                    onChange={(event) =>
                      updateIncomeSource(source.id, {
                        excludeKeywordsText: event.target.value,
                      })
                    }
                    placeholder={t("trackedIncomeExcludePlaceholder")}
                    disabled={isDemo || isPending}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("trackedIncomeExcludeHint")}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer"
                    checked={source.requireRoundAmount}
                    disabled={isDemo || isPending}
                    onChange={(event) =>
                      updateIncomeSource(source.id, {
                        requireRoundAmount: event.target.checked,
                      })
                    }
                  />
                  <span>{t("trackedIncomeRoundLabel")}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={isDemo || isPending}
          onClick={() =>
            setIncomeSources((prev) => [...prev, newIncomeSource()])
          }
        >
          <Plus className="size-4" aria-hidden />
          {t("trackedIncomeAdd")}
        </Button>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">
          {t("trackedOutgoingTitle")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("trackedOutgoingDescription")}
        </p>

        {outgoingPeople.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("trackedOutgoingEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {outgoingPeople.map((person, index) => (
              <li
                key={person.id}
                className="space-y-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {t("trackedOutgoingPersonTitle", { index: index + 1 })}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer text-muted-foreground hover:text-destructive"
                    disabled={isDemo || isPending}
                    onClick={() =>
                      setOutgoingPeople((prev) =>
                        prev.filter((row) => row.id !== person.id),
                      )
                    }
                    aria-label={t("trackedOutgoingRemove")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`outgoing-label-${person.id}`}>
                      {t("trackedOutgoingLabelLabel")}
                    </Label>
                    <Input
                      id={`outgoing-label-${person.id}`}
                      value={person.label}
                      onChange={(event) =>
                        updateOutgoingPerson(person.id, {
                          label: event.target.value,
                        })
                      }
                      placeholder={t("trackedOutgoingLabelPlaceholder")}
                      disabled={isDemo || isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`outgoing-keyword-${person.id}`}>
                      {t("trackedOutgoingKeywordLabel")}
                    </Label>
                    <Input
                      id={`outgoing-keyword-${person.id}`}
                      value={person.keyword}
                      onChange={(event) =>
                        updateOutgoingPerson(person.id, {
                          keyword: event.target.value,
                        })
                      }
                      placeholder={t("trackedOutgoingKeywordPlaceholder")}
                      disabled={isDemo || isPending}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={isDemo || isPending}
          onClick={() =>
            setOutgoingPeople((prev) => [...prev, newOutgoingPerson()])
          }
        >
          <Plus className="size-4" aria-hidden />
          {t("trackedOutgoingAdd")}
        </Button>
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
