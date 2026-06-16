/**
 * @file categories-manager.tsx
 * @description Gestion des catégories de dépenses personnalisées.
 */

"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  createCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dedupeCategories } from "@/lib/finance/expense-categories";
import type { Category } from "@/types/database";

interface CategoriesManagerProps {
  categories: Category[];
  isDemo: boolean;
}

export function CategoriesManager({ categories, isDemo }: CategoriesManagerProps) {
  const t = useTranslations("categories");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const uniqueCategories = dedupeCategories(categories);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCategoryAction(formData);
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
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await deleteCategoryAction(formData);
      if (result.error === "demo") {
        setError(t("demoError"));
        return;
      }
      if (result.error) {
        setError(t("saveError"));
        return;
      }
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
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate(new FormData(event.currentTarget));
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
              <li
                key={category.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                  disabled={isPending || isDemo}
                  onClick={() => handleDelete(category.id)}
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
