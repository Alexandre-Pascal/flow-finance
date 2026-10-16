/**
 * @file balance-breakdown.tsx
 * @description Détail d'un solde total, compte par compte, au survol.
 *
 * Un total seul ne dit pas d'où vient l'argent : le survol répond sans ouvrir
 * une page. Le clic ouvre aussi l'info-bulle, faute de survol sur mobile.
 */

"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface BalanceBreakdownRow {
  id: string;
  label: string;
  value: string;
  /** Nature du compte (courant, épargne), affichée sous le libellé. */
  hint?: string;
}

export function BalanceBreakdown({
  value,
  rows,
  label,
}: {
  value: string;
  rows: BalanceBreakdownRow[];
  label: string;
}) {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) {
    return <p className="text-2xl font-semibold tracking-tight">{value}</p>;
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => setOpen((current) => !current)}
          className="cursor-pointer text-left text-2xl font-semibold tracking-tight underline decoration-dotted decoration-muted-foreground/50 underline-offset-4"
        >
          {value}
        </button>
      </TooltipTrigger>
      <TooltipContent align="start" className="w-64">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {row.label}
                {row.hint ? (
                  <span className="text-muted-foreground"> · {row.hint}</span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
