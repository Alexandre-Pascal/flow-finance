/**
 * @file savings-goals-manager.tsx
 * @description Objectifs d'épargne : cible, avancement et répartition à
 * l'intérieur des livrets. Un livret peut financer plusieurs objectifs, d'où
 * l'affichage systématique du solde non affecté.
 */

"use client";

import {
  AlertTriangle,
  Check,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  createSavingsGoalAction,
  deleteSavingsGoalAction,
  setSavingsGoalAllocationAction,
  updateSavingsGoalAction,
} from "@/app/actions/savings-goals";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_COLOR_PALETTE,
  normalizeColor,
  pickAvailableColor,
} from "@/lib/finance/expense-categories";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  GoalSourceView,
  SavingsGoalsOverview,
  SavingsGoalView,
} from "@/lib/finance/savings-goals";
import { cn } from "@/lib/utils";
import type {
  SavingsGoalAllocationMode,
  SavingsGoalSourceKind,
} from "@/types/database";

/** Support visé par une affectation, côté client. */
interface GoalFundingSourceRef {
  id: string;
  kind: SavingsGoalSourceKind;
}

interface SavingsGoalsManagerProps {
  overview: SavingsGoalsOverview;
  locale: string;
  isDemo: boolean;
  schemaReady: boolean;
}

interface GoalFormValues {
  name: string;
  targetAmount: string;
  targetDate: string;
  color: string;
}

function emptyForm(usedColors: string[]): GoalFormValues {
  return {
    name: "",
    targetAmount: "",
    targetDate: "",
    color: pickAvailableColor(usedColors),
  };
}

function ColorSwatches({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("goals");

  return (
    <div
      className="flex flex-wrap gap-2"
      role="radiogroup"
      aria-label={t("colorLabel")}
    >
      {CATEGORY_COLOR_PALETTE.slice(0, 12).map((color) => {
        const isSelected = normalizeColor(value) === normalizeColor(color);

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={color}
            disabled={disabled}
            onClick={() => onChange(color)}
            className={cn(
              "size-6 cursor-pointer rounded-full border-2 transition-colors duration-200",
              isSelected ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

function GoalFields({
  values,
  onChange,
  disabled,
  idPrefix,
}: {
  values: GoalFormValues;
  onChange: (values: GoalFormValues) => void;
  disabled: boolean;
  idPrefix: string;
}) {
  const t = useTranslations("goals");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>{t("nameLabel")}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
          placeholder={t("namePlaceholder")}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-target`}>{t("targetLabel")}</Label>
        <Input
          id={`${idPrefix}-target`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={values.targetAmount}
          onChange={(event) =>
            onChange({ ...values, targetAmount: event.target.value })
          }
          placeholder={t("targetPlaceholder")}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-date`}>{t("targetDateLabel")}</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={values.targetDate}
          onChange={(event) =>
            onChange({ ...values, targetDate: event.target.value })
          }
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">{t("targetDateHint")}</p>
      </div>
      <div className="space-y-2">
        <Label>{t("colorLabel")}</Label>
        <ColorSwatches
          value={values.color}
          onChange={(color) => onChange({ ...values, color })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function AllocationEditor({
  goal,
  sources,
  isPending,
  locale,
  onAllocate,
  onClose,
}: {
  goal: SavingsGoalView;
  sources: GoalSourceView[];
  isPending: boolean;
  locale: string;
  onAllocate: (
    goalId: string,
    source: GoalFundingSourceRef,
    amount: string,
    mode: SavingsGoalAllocationMode,
  ) => void;
  onClose: () => void;
}) {
  const t = useTranslations("goals");
  const current = useMemo(
    () => new Map(goal.allocations.map((row) => [row.sourceId, row])),
    [goal.allocations],
  );
  // Un livret réservé n'a pas de montant saisi : le champ repart vide.
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sources.map((view) => {
        const row = current.get(view.source.id);
        return [
          view.source.id,
          row && row.mode === "fixed" ? String(row.amount) : "",
        ];
      }),
    ),
  );
  const [modes, setModes] = useState<Record<string, SavingsGoalAllocationMode>>(
    () =>
      Object.fromEntries(
        sources.map((view) => [
          view.source.id,
          current.get(view.source.id)?.mode ?? "fixed",
        ]),
      ),
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {t("allocateTitle")}
          </p>
          <p className="text-xs text-muted-foreground">{t("allocateHint")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 cursor-pointer"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <ul className="space-y-2">
        {sources.map((view) => {
          const row = current.get(view.source.id);
          const fixedHere = row && row.mode === "fixed" ? row.amount : 0;
          const countedHere = row?.amount ?? 0;
          // Ce que l'objectif peut prendre : le non affecté du livret plus sa propre part.
          const available = view.unallocated + countedHere;
          const draft = drafts[view.source.id] ?? "";
          const mode = modes[view.source.id] ?? "fixed";
          const unchanged =
            mode === "fixed"
              ? (row?.mode ?? "fixed") === "fixed" &&
                draft.trim() === (fixedHere ? String(fixedHere) : "")
              : row?.mode === mode;

          return (
            <li
              key={view.source.id}
              className="space-y-2 rounded-md border border-border bg-background p-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: view.source.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {view.source.name}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("available", {
                    amount: formatCurrency(Math.max(0, available), locale),
                  })}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex rounded-md border border-border p-0.5"
                  role="radiogroup"
                  aria-label={t("allocationModeLabel", {
                    account: view.source.name,
                  })}
                >
                  {(
                    [
                      ["fixed", "allocationModeFixed"],
                      ["remainder", "allocationModeRemainder"],
                      ["full", "allocationModeFull"],
                    ] as const
                  ).map(([value, labelKey]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={mode === value}
                      variant={mode === value ? "default" : "ghost"}
                      className="h-7 cursor-pointer px-2 text-xs"
                      disabled={isPending}
                      onClick={() =>
                        setModes((previous) => ({
                          ...previous,
                          [view.source.id]: value,
                        }))
                      }
                    >
                      {t(labelKey)}
                    </Button>
                  ))}
                </div>

                {mode !== "fixed" ? (
                  <span className="flex-1 text-xs tabular-nums text-muted-foreground">
                    {mode === "full"
                      ? t("allocationFullValue", {
                          amount: formatCurrency(view.balance, locale),
                        })
                      : t("allocationRemainderValue", {
                          amount: formatCurrency(Math.max(0, available), locale),
                        })}
                  </span>
                ) : (
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="h-8 w-28 tabular-nums"
                    aria-label={t("allocationAmountLabel", {
                      account: view.source.name,
                    })}
                    value={draft}
                    disabled={isPending}
                    onChange={(event) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [view.source.id]: event.target.value,
                      }))
                    }
                  />
                )}

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 cursor-pointer"
                  aria-label={t("allocationSave")}
                  title={t("allocationSave")}
                  disabled={isPending || unchanged}
                  onClick={() =>
                    onAllocate(
                      goal.goal.id,
                      { id: view.source.id, kind: view.source.kind },
                      draft.trim() || "0",
                      mode,
                    )
                  }
                >
                  <Check className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GoalCard({
  goal,
  sources,
  isDemo,
  isPending,
  locale,
  onUpdate,
  onDelete,
  onAllocate,
}: {
  goal: SavingsGoalView;
  sources: GoalSourceView[];
  isDemo: boolean;
  isPending: boolean;
  locale: string;
  onUpdate: (id: string, values: GoalFormValues) => void;
  onDelete: (id: string) => void;
  onAllocate: (
    goalId: string,
    source: GoalFundingSourceRef,
    amount: string,
    mode: SavingsGoalAllocationMode,
  ) => void;
}) {
  const t = useTranslations("goals");
  const [isEditing, setEditing] = useState(false);
  const [isAllocating, setAllocating] = useState(false);
  const [values, setValues] = useState<GoalFormValues>({
    name: goal.goal.name,
    targetAmount: String(goal.goal.target_amount),
    targetDate: goal.goal.target_date ?? "",
    color: goal.goal.color,
  });

  function startEditing() {
    setValues({
      name: goal.goal.name,
      targetAmount: String(goal.goal.target_amount),
      targetDate: goal.goal.target_date ?? "",
      color: goal.goal.color,
    });
    setEditing(true);
  }

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: goal.goal.color }}
              aria-hidden
            />
            <p className="truncate font-medium text-foreground">
              {goal.goal.name}
            </p>
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {t("progressLabel", {
              allocated: formatCurrency(goal.allocated, locale),
              target: formatCurrency(goal.goal.target_amount, locale),
            })}
          </p>
        </div>

        {isDemo ? null : (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              disabled={isPending}
              aria-label={t("allocateButton")}
              title={t("allocateButton")}
              onClick={() => setAllocating((open) => !open)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              disabled={isPending}
              aria-label={t("editButton")}
              title={t("editButton")}
              onClick={() => (isEditing ? setEditing(false) : startEditing())}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer text-destructive"
              disabled={isPending}
              aria-label={t("deleteButton")}
              title={t("deleteButton")}
              onClick={() => onDelete(goal.goal.id)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${Math.round(goal.progress * 100)}%`,
              backgroundColor: goal.goal.color,
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {goal.isReached
              ? t("reached")
              : t("remaining", {
                  amount: formatCurrency(goal.remaining, locale),
                })}
          </span>
          {goal.goal.target_date ? (
            <span className="tabular-nums">
              {goal.monthlyEffort === null
                ? t("deadline", {
                    date: formatDate(goal.goal.target_date, locale),
                  })
                : goal.monthsLeft === 0
                  ? t("deadlinePassed", {
                      amount: formatCurrency(goal.remaining, locale),
                    })
                  : t("monthlyEffort", {
                      amount: formatCurrency(goal.monthlyEffort, locale),
                      date: formatDate(goal.goal.target_date, locale),
                    })}
            </span>
          ) : null}
        </div>
      </div>

      {goal.allocations.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {goal.allocations.map((allocation) => (
            <li
              key={allocation.sourceId}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: allocation.color }}
                aria-hidden
              />
              <span className="text-foreground">{allocation.sourceName}</span>
              {allocation.mode === "fixed" ? null : (
                <span className="rounded-full bg-muted px-1.5 text-[0.65rem] uppercase tracking-wide">
                  {allocation.mode === "full"
                    ? t("allocationFullBadge")
                    : t("allocationRemainderBadge")}
                </span>
              )}
              <span className="tabular-nums">
                {formatCurrency(allocation.amount, locale)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t("noAllocations")}</p>
      )}

      {isAllocating && !isDemo ? (
        sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noAccounts")}</p>
        ) : (
          <AllocationEditor
            goal={goal}
            sources={sources}
            isPending={isPending}
            locale={locale}
            onAllocate={onAllocate}
            onClose={() => setAllocating(false)}
          />
        )
      ) : null}

      {isEditing && !isDemo ? (
        <form
          className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdate(goal.goal.id, values);
            setEditing(false);
          }}
        >
          <GoalFields
            values={values}
            onChange={setValues}
            disabled={isPending}
            idPrefix={`goal-${goal.goal.id}`}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              className="cursor-pointer"
              disabled={isPending || !values.name.trim() || !values.targetAmount}
            >
              {t("saveButton")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              disabled={isPending}
              onClick={() => setEditing(false)}
            >
              {t("cancelButton")}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function SourcesRecap({
  sources,
  locale,
}: {
  sources: GoalSourceView[];
  locale: string;
}) {
  const t = useTranslations("goals");

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{t("accountsTitle")}</p>
      <ul className="space-y-2">
        {sources.map((view) => {
          // Le sur-affecté sature la barre : les parts se répartissent alors
          // sur ce qui est réclamé, et l'anneau rouge signale le dépassement.
          const base = Math.max(view.balance, view.allocated, 0.01);

          return (
            <li
              key={view.source.id}
              className="space-y-1.5 rounded-lg border border-border px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: view.source.color }}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {view.source.name}
                  </span>
                  {view.isReserved || view.hasRemainderClaim ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                      {view.isReserved
                        ? t("accountReserved")
                        : t("accountRemainder")}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("accountSplit", {
                    allocated: formatCurrency(view.allocated, locale),
                    balance: formatCurrency(view.balance, locale),
                  })}
                </span>
              </div>

              <div
                className={cn(
                  "flex h-2 w-full overflow-hidden rounded-full bg-muted",
                  view.isOverAllocated && "ring-1 ring-destructive/60",
                )}
                aria-hidden
              >
                {view.goals.map((share) => (
                  <div
                    key={share.goalId}
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${(share.amount / base) * 100}%`,
                      backgroundColor: share.color,
                    }}
                    title={`${share.goalName} · ${formatCurrency(share.amount, locale)}`}
                  />
                ))}
              </div>

              {view.goals.length > 0 ? (
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {view.goals.map((share) => (
                    <li
                      key={share.goalId}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: share.color }}
                        aria-hidden
                      />
                      <span className="text-foreground">{share.goalName}</span>
                      <span className="tabular-nums">
                        {formatCurrency(share.amount, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p
                className={cn(
                  "text-xs tabular-nums",
                  view.isOverAllocated
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {view.isOverAllocated
                  ? t("accountOverAllocated", {
                      amount: formatCurrency(-view.unallocated, locale),
                    })
                  : t("accountUnallocated", {
                      amount: formatCurrency(view.unallocated, locale),
                    })}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SavingsGoalsManager({
  overview,
  locale,
  isDemo,
  schemaReady,
}: SavingsGoalsManagerProps) {
  const t = useTranslations("goals");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const usedColors = useMemo(
    () => overview.goals.map((view) => view.goal.color),
    [overview.goals],
  );
  const [isCreating, setCreating] = useState(false);
  const [form, setForm] = useState<GoalFormValues>(() => emptyForm(usedColors));

  function runAction(
    action: (formData: FormData) => Promise<{ error?: string }>,
    formData: FormData,
    onDone?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error === "demo") {
        setError(t("demoError"));
        return;
      }
      if (result.error === "schema") {
        setError(t("schemaError"));
        return;
      }
      if (result.error) {
        setError(t("saveError"));
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function goalFormData(values: GoalFormValues, id?: string): FormData {
    const formData = new FormData();
    if (id) {
      formData.set("id", id);
    }
    formData.set("name", values.name.trim());
    formData.set("targetAmount", values.targetAmount.trim());
    formData.set("targetDate", values.targetDate);
    formData.set("color", values.color);
    return formData;
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runAction(createSavingsGoalAction, goalFormData(form), () => {
      setForm(emptyForm([...usedColors, form.color]));
      setCreating(false);
    });
  }

  function handleUpdate(id: string, values: GoalFormValues) {
    runAction(updateSavingsGoalAction, goalFormData(values, id));
  }

  function handleDelete(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    runAction(deleteSavingsGoalAction, formData);
  }

  function handleAllocate(
    goalId: string,
    source: GoalFundingSourceRef,
    amount: string,
    mode: SavingsGoalAllocationMode,
  ) {
    const formData = new FormData();
    formData.set("goalId", goalId);
    formData.set("sourceKind", source.kind);
    formData.set("savingsAccountId", source.kind === "pea" ? "" : source.id);
    formData.set("amount", amount);
    formData.set("mode", mode);
    runAction(setSavingsGoalAllocationAction, formData);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile
          icon={<PiggyBank className="size-4" aria-hidden />}
          label={t("summaryBalance")}
          value={formatCurrency(overview.totalBalance, locale)}
        />
        <SummaryTile
          icon={<Target className="size-4" aria-hidden />}
          label={t("summaryAllocated")}
          value={formatCurrency(overview.totalAllocated, locale)}
        />
        <SummaryTile
          icon={<SlidersHorizontal className="size-4" aria-hidden />}
          label={t("summaryAvailable")}
          value={formatCurrency(overview.totalUnallocated, locale)}
          isNegative={overview.totalUnallocated < 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isDemo ? (
            <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {t("demoHint")}
            </p>
          ) : null}

          {!isDemo && !schemaReady ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {t("schemaError")}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {overview.hasOverAllocation ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("overAllocationWarning")}
            </p>
          ) : null}

          {!isDemo && schemaReady ? (
            isCreating ? (
              <form
                onSubmit={handleCreate}
                className="space-y-4 rounded-lg border border-border p-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("addTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("addDescription")}
                  </p>
                </div>

                <GoalFields
                  values={form}
                  onChange={setForm}
                  disabled={isPending}
                  idPrefix="new-goal"
                />

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="cursor-pointer"
                    disabled={
                      isPending || !form.name.trim() || !form.targetAmount.trim()
                    }
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("addButton")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="cursor-pointer"
                    disabled={isPending}
                    onClick={() => setCreating(false)}
                  >
                    {t("cancelButton")}
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                disabled={isPending}
                onClick={() => {
                  setForm(emptyForm(usedColors));
                  setCreating(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                {t("addButton")}
              </Button>
            )
          ) : null}

          {overview.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {overview.sources.length === 0 && !isDemo
                ? t("noAccounts")
                : t("empty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {overview.goals.map((goal) => (
                <GoalCard
                  key={goal.goal.id}
                  goal={goal}
                  sources={overview.sources}
                  isDemo={isDemo}
                  isPending={isPending}
                  locale={locale}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onAllocate={handleAllocate}
                />
              ))}
            </ul>
          )}

          {overview.sources.length > 0 ? (
            <SourcesRecap sources={overview.sources} locale={locale} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  isNegative,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isNegative?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            isNegative ? "text-destructive" : "text-foreground",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
