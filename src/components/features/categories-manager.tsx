/**
 * @file categories-manager.tsx
 * @description Gestion des catégories de dépenses personnalisées (création, édition, couleurs uniques).
 */

"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  createCategoryAction,
  deleteCategoryAction,
  rematchCategoriesAction,
  updateCategoryAction,
  type CategoryActionError,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_COLOR_PALETTE,
  dedupeCategories,
  normalizeColor,
  pickAvailableColor,
} from "@/lib/finance/expense-categories";
import { cn } from "@/lib/utils";
import type { Category } from "@/types/database";

interface CategoriesManagerProps {
  categories: Category[];
  isDemo: boolean;
  schemaReady?: boolean;
}

function ColorPicker({
  value,
  onChange,
  disabledColors,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabledColors: Set<string>;
  disabled?: boolean;
}) {
  const t = useTranslations("categories");

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("colorLabel")}>
      {CATEGORY_COLOR_PALETTE.map((color) => {
        const normalized = normalizeColor(color);
        const isSelected = normalizeColor(value) === normalized;
        const isTaken = disabledColors.has(normalized) && !isSelected;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={color}
            title={isTaken ? t("colorTakenHint") : color}
            disabled={disabled || isTaken}
            onClick={() => onChange(color)}
            className={cn(
              "size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition",
              isSelected ? "ring-foreground" : "ring-transparent",
              isTaken
                ? "cursor-not-allowed opacity-25"
                : "cursor-pointer hover:scale-110",
            )}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

function CategoryRow({
  category,
  usedColors,
  isPending,
  isDemo,
  onEdit,
  onDelete,
}: {
  category: Category;
  usedColors: Set<string>;
  isPending: boolean;
  isDemo: boolean;
  onEdit: (
    id: string,
    values: { name: string; color: string; keywords: string },
  ) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("categories");
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [keywords, setKeywords] = useState(category.keyword_rules.join(", "));

  const otherColors = useMemo(() => {
    const set = new Set(usedColors);
    set.delete(normalizeColor(category.color));
    return set;
  }, [usedColors, category.color]);

  function startEditing() {
    setName(category.name);
    setColor(category.color);
    setKeywords(category.keyword_rules.join(", "));
    setIsEditing(true);
  }

  function handleSave() {
    onEdit(category.id, { name, color, keywords });
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <li className="space-y-3 px-4 py-3">
        <div className="space-y-2">
          <Label htmlFor={`edit-name-${category.id}`}>{t("nameLabel")}</Label>
          <Input
            id={`edit-name-${category.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("colorLabel")}</Label>
          <ColorPicker
            value={color}
            onChange={setColor}
            disabledColors={otherColors}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`edit-keywords-${category.id}`}>{t("keywordsLabel")}</Label>
          <Input
            id={`edit-keywords-${category.id}`}
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder={t("keywordsPlaceholder")}
            disabled={isPending}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            disabled={isPending || !name.trim()}
            onClick={handleSave}
          >
            <Check className="size-4" aria-hidden />
            {t("save")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="cursor-pointer"
            disabled={isPending}
            onClick={() => setIsEditing(false)}
          >
            <X className="size-4" aria-hidden />
            {t("cancel")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: category.color }}
            aria-hidden
          />
          <p className="font-medium text-foreground">{category.name}</p>
        </div>
        {category.keyword_rules.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("keywordsList", {
              keywords: category.keyword_rules.join(", "),
            })}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-muted-foreground hover:text-foreground"
          disabled={isPending || isDemo}
          onClick={startEditing}
          aria-label={t("edit")}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-muted-foreground hover:text-destructive"
          disabled={isPending || isDemo}
          onClick={() => onDelete(category.id)}
          aria-label={t("delete")}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function CategoriesManager({
  categories,
  isDemo,
  schemaReady = true,
}: CategoriesManagerProps) {
  const t = useTranslations("categories");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uniqueCategories = useMemo(
    () => dedupeCategories(categories),
    [categories],
  );

  const usedColors = useMemo(
    () => new Set(uniqueCategories.map((category) => normalizeColor(category.color))),
    [uniqueCategories],
  );

  const [newColor, setNewColor] = useState(() =>
    pickAvailableColor(uniqueCategories.map((category) => category.color)),
  );

  function translateError(actionError: CategoryActionError): string {
    switch (actionError) {
      case "demo":
        return t("demoError");
      case "schema":
        return t("schemaError");
      case "colorTaken":
        return t("colorTakenError");
      case "nameTaken":
        return t("nameTakenError");
      default:
        return t("saveError");
    }
  }

  function handleCreate(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createCategoryAction(formData);
      if (result.error) {
        setError(translateError(result.error));
        return;
      }
      setNewColor(
        pickAvailableColor([
          ...uniqueCategories.map((category) => category.color),
          newColor,
        ]),
      );
      router.refresh();
    });
  }

  function handleEdit(
    id: string,
    values: { name: string; color: string; keywords: string },
  ) {
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("name", values.name);
    formData.set("color", values.color);
    formData.set("keywords", values.keywords);
    startTransition(async () => {
      const result = await updateCategoryAction(formData);
      if (result.error) {
        setError(translateError(result.error));
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await deleteCategoryAction(formData);
      if (result.error) {
        setError(translateError(result.error));
        return;
      }
      router.refresh();
    });
  }

  function handleRematch() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await rematchCategoriesAction();
      if (result.error === "demo") {
        setError(t("demoError"));
        return;
      }
      if (result.error === "schema") {
        setError(t("schemaError"));
        return;
      }
      if (result.error) {
        setError(t("rematchError"));
        return;
      }
      setSuccess(t("rematchSuccess", { count: result.matched ?? 0 }));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!schemaReady ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {t("schemaError")}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
            {success}
          </p>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("color", newColor);
            handleCreate(formData);
            event.currentTarget.reset();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="category-name">{t("nameLabel")}</Label>
            <Input
              id="category-name"
              name="name"
              placeholder={t("namePlaceholder")}
              disabled={isPending || isDemo}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("colorLabel")}</Label>
            <ColorPicker
              value={newColor}
              onChange={setNewColor}
              disabledColors={usedColors}
              disabled={isPending || isDemo}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-keywords">{t("keywordsLabel")}</Label>
            <Input
              id="category-keywords"
              name="keywords"
              placeholder={t("keywordsPlaceholder")}
              disabled={isPending || isDemo}
            />
            <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
          </div>
          <Button
            type="submit"
            disabled={isPending || isDemo}
            className="cursor-pointer"
          >
            {t("addButton")}
          </Button>
        </form>

        {uniqueCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {uniqueCategories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                usedColors={usedColors}
                isPending={isPending}
                isDemo={isDemo}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={isPending || isDemo || !schemaReady}
          className="cursor-pointer"
          onClick={handleRematch}
        >
          {t("rematchButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
