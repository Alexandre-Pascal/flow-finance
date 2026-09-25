/**
 * @file spaces-manager.tsx
 * @description Espaces et affectation des comptes : séparer un budget perso
 * d'un budget partagé.
 */

"use client";

import { Check, Pencil, Plus, Trash2, Users, Wallet, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  deleteManualAccountAction,
  renameAccountAction,
} from "@/app/actions/accounts";
import {
  assignAccountSpaceAction,
  createSpaceAction,
  deleteSpaceAction,
  renameSpaceAction,
} from "@/app/actions/spaces";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { isManualAccount } from "@/lib/finance/account-transfers";
import { accountLabel, defaultSpace } from "@/lib/finance/spaces";
import { cn } from "@/lib/utils";
import type { Account, Space, SpaceKind } from "@/types/database";

interface SpacesManagerProps {
  spaces: Space[];
  accounts: Account[];
  locale: string;
  isDemo: boolean;
}

export function SpacesManager({
  spaces,
  accounts,
  locale,
  isDemo,
}: SpacesManagerProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SpaceKind>("shared");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draftAccountName, setDraftAccountName] = useState("");

  const fallback = defaultSpace(spaces);

  function runAction(
    action: (formData: FormData) => Promise<{ error?: string }>,
    formData: FormData,
    onDone?: () => void,
  ) {
    if (isDemo) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error === "schema") {
        setError(t("spaceSchemaError"));
        return;
      }
      if (result.error) {
        setError(t("spaceSaveError"));
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("name", newName.trim());
    formData.set("kind", newKind);
    runAction(createSpaceAction, formData, () => setNewName(""));
  }

  function handleRename(id: string) {
    const name = draftName.trim();
    setEditingId(null);
    if (!name) {
      return;
    }
    const formData = new FormData();
    formData.set("id", id);
    formData.set("name", name);
    runAction(renameSpaceAction, formData);
  }

  function handleDelete(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    runAction(deleteSpaceAction, formData);
  }

  function handleRenameAccount(accountId: string) {
    const name = draftAccountName.trim();
    setEditingAccountId(null);
    const formData = new FormData();
    formData.set("id", accountId);
    // Un nom vide rend la main au libellé de la banque.
    formData.set("name", name);
    runAction(renameAccountAction, formData);
  }

  function handleDeleteAccount(accountId: string) {
    const formData = new FormData();
    formData.set("id", accountId);
    runAction(deleteManualAccountAction, formData);
  }

  function handleAssign(accountId: string, spaceId: string) {
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("spaceId", spaceId);
    runAction(assignAccountSpaceAction, formData);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("spacesDescription")}</p>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {spaces.map((space) => {
          const count = accounts.filter(
            (account) => (account.space_id ?? fallback?.id) === space.id,
          ).length;

          return (
            <li
              key={space.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3"
            >
              {editingId === space.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleRename(space.id);
                      }
                      if (event.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    className="h-8"
                    aria-label={t("spaceRename")}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 cursor-pointer"
                    aria-label={t("spaceRename")}
                    disabled={isPending}
                    onClick={() => handleRename(space.id)}
                  >
                    <Check className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 cursor-pointer"
                    aria-label={t("spaceRenameCancel")}
                    disabled={isPending}
                    onClick={() => setEditingId(null)}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  {space.kind === "shared" ? (
                    <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="truncate font-medium text-foreground">
                    {space.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("spaceAccountCount", { count })}
                  </span>
                </div>
              )}

              {isDemo || editingId === space.id ? null : (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="cursor-pointer"
                    aria-label={t("spaceRename")}
                    title={t("spaceRename")}
                    disabled={isPending}
                    onClick={() => {
                      setDraftName(space.name);
                      setEditingId(space.id);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="cursor-pointer text-destructive"
                    aria-label={t("spaceDelete")}
                    title={t("spaceDelete")}
                    disabled={isPending || spaces.length < 2}
                    onClick={() => handleDelete(space.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isDemo ? null : (
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Label htmlFor="new-space-name">{t("spaceAddLabel")}</Label>
            <Input
              id="new-space-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("spaceNamePlaceholder")}
              disabled={isPending}
            />
          </div>
          <div className="flex rounded-md border border-border p-0.5">
            {(
              [
                ["personal", "spaceKindPersonal"],
                ["shared", "spaceKindShared"],
              ] as const
            ).map(([value, labelKey]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={newKind === value ? "default" : "ghost"}
                className="h-8 cursor-pointer px-2 text-xs"
                disabled={isPending}
                onClick={() => setNewKind(value)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
          <Button
            type="submit"
            className="cursor-pointer"
            disabled={isPending || !newName.trim()}
          >
            <Plus className="size-4" aria-hidden />
            {t("spaceAdd")}
          </Button>
        </form>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t("spaceAccountsTitle")}
        </p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("spaceNoAccounts")}</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => {
              const current =
                spaces.find(
                  (space) => space.id === (account.space_id ?? fallback?.id),
                ) ?? null;

              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3"
                >
                  {editingAccountId === account.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <Input
                        value={draftAccountName}
                        onChange={(event) =>
                          setDraftAccountName(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleRenameAccount(account.id);
                          }
                          if (event.key === "Escape") {
                            setEditingAccountId(null);
                          }
                        }}
                        className="h-8"
                        placeholder={account.name}
                        aria-label={t("accountRename")}
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0 cursor-pointer"
                        aria-label={t("accountRename")}
                        disabled={isPending}
                        onClick={() => handleRenameAccount(account.id)}
                      >
                        <Check className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0 cursor-pointer"
                        aria-label={t("spaceRenameCancel")}
                        disabled={isPending}
                        onClick={() => setEditingAccountId(null)}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {accountLabel(account)}
                      </p>
                      <p className="truncate text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(
                          account.balance,
                          locale,
                          account.currency,
                        )}
                        {account.display_name ? ` · ${account.name}` : null}
                        {isManualAccount(account)
                          ? ` · ${(account.match_keywords ?? [])[0]}`
                          : null}
                      </p>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    {isDemo || editingAccountId === account.id ? null : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="cursor-pointer"
                        aria-label={t("accountRename")}
                        title={t("accountRename")}
                        disabled={isPending}
                        onClick={() => {
                          setDraftAccountName(account.display_name ?? "");
                          setEditingAccountId(account.id);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={isPending || isDemo || spaces.length === 0}
                        className={cn(
                          "inline-flex h-8 max-w-[190px] cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-normal text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
                        )}
                        aria-label={t("spaceAssignLabel")}
                      >
                        <span className="truncate">
                          {current?.name ?? t("spaceAssignNone")}
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>
                        {t("spaceAssignLabel")}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {spaces.map((space) => (
                        <DropdownMenuCheckboxItem
                          key={space.id}
                          checked={current?.id === space.id}
                          onCheckedChange={() =>
                            handleAssign(account.id, space.id)
                          }
                          className="cursor-pointer"
                        >
                          <span className="truncate">{space.name}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Seul un compte créé à la main se supprime : les autres
                        appartiennent à la synchronisation bancaire. */}
                    {isManualAccount(account) && !isDemo ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="cursor-pointer text-destructive"
                        aria-label={t("spaceAccountDelete")}
                        title={t("spaceAccountDelete")}
                        disabled={isPending}
                        onClick={() => handleDeleteAccount(account.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
