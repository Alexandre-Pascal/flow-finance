/**
 * @file spending-flow-graph.tsx
 * @description Corps recharts du Sankey de répartition : entrées → budget →
 * postes → détail.
 *
 * Isolé dans son propre module pour que `spending-flow-panel.tsx` puisse le
 * charger via `next/dynamic` : recharts est lourd et n'a rien à faire dans le
 * bundle initial du dashboard.
 */

"use client";

import { Sankey, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";
import type {
  FlowEntry,
  SpendingFlow,
  SpendingFlowNode,
} from "@/lib/finance/spending-flow";

/** Ce que recharts passe au tooltip : un nœud, ou un lien et ses deux bouts. */
interface TooltipDatum {
  name?: string;
  value?: number;
  items?: FlowEntry[];
  source?: { name?: string };
  target?: { name?: string };
  payload?: TooltipDatum;
}

export interface SpendingFlowGraphProps {
  flow: SpendingFlow;
  locale: string;
  /**
   * Largeur mesurée par le panneau. recharts ne transmet pas la largeur du
   * conteneur aux formes personnalisées, et c'est elle qui détermine les
   * couloirs de libellés : on la passe explicitement plutôt que de deviner.
   */
  width: number;
  /** Hauteur calculée par le panneau selon le nombre de postes. */
  height: number;
}

const NODE_WIDTH = 10;
const NODE_PADDING = 30;
const LABEL_GAP = 8;
const LABEL_HEIGHT = 22;
/** Couloir réservé aux libellés de la dernière colonne. */
const LABEL_LANE = 280;
const MARGIN = { top: 8, right: LABEL_LANE, bottom: 8, left: 8 };

interface NodeShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SpendingFlowNode & { depth: number };
  locale: string;
  maxDepth: number;
  chartWidth: number;
  /** Décalage vertical par nœud, pour le centrer sur ses enfants. */
  shifts: Map<string, number>;
}

/**
 * recharts empile chaque colonne depuis le haut : la colonne la plus remplie
 * tient toute la hauteur, les autres laissent un vide sous elles. Centrer
 * chaque colonne sur elle-même décalerait un parent par rapport à ses lignes,
 * et les rubans se remettraient à se croiser. On centre donc chaque nœud sur
 * l'étendue de ses enfants, en remontant depuis la droite : le budget finit
 * centré sur tout le graphique, les entrées sur le budget, et les rubans
 * restent horizontaux.
 *
 * Le décalage obtenu s'applique au nœud et aux bouts de liens qui le touchent.
 */
function verticalShifts(
  flow: SpendingFlow,
  plotHeight: number,
): Map<string, number> {
  const maxDepth = flow.nodes.reduce(
    (deepest, node) => Math.max(deepest, node.depth),
    0,
  );

  const columns: SpendingFlowNode[][] = [];
  for (const node of flow.nodes) {
    const index = node.isLeaf ? maxDepth : node.depth;
    columns[index] = [...(columns[index] ?? []), node];
  }

  const filled = columns.filter((column) => column?.length);
  if (filled.length === 0) {
    return new Map();
  }

  // Même mise à l'échelle que recharts : la colonne la plus serrée commande.
  const ratio = Math.min(
    ...filled.map((column) => {
      const total = column.reduce((sum, node) => sum + node.value, 0);
      return total > 0
        ? (plotHeight - (column.length - 1) * NODE_PADDING) / total
        : Number.POSITIVE_INFINITY;
    }),
  );

  const heights = new Map<string, number>();
  const base = new Map<string, number>();
  for (const column of filled) {
    let cursor = 0;
    for (const node of column) {
      const nodeHeight = node.value * ratio;
      heights.set(node.key, nodeHeight);
      base.set(node.key, cursor);
      cursor += nodeHeight + NODE_PADDING;
    }
  }

  // Dans une barre, les liens entrants s'empilent dans l'ordre où ils arrivent :
  // on note la bande de chacun pour pouvoir y aligner son nœud d'origine.
  const bandStart = new Map<number, number>();
  const filling = new Map<string, number>();
  const outgoingOf = new Map<string, number[]>();
  for (const [index, link] of flow.links.entries()) {
    const parent = flow.nodes[link.source]?.key;
    const child = flow.nodes[link.target]?.key;
    if (!parent || !child) {
      continue;
    }
    const used = filling.get(child) ?? 0;
    bandStart.set(index, used * ratio);
    filling.set(child, used + link.value);
    outgoingOf.set(parent, [...(outgoingOf.get(parent) ?? []), index]);
  }

  const placed = new Map<string, number>();
  for (const node of columns[maxDepth] ?? []) {
    placed.set(node.key, base.get(node.key) ?? 0);
  }

  for (let depth = maxDepth - 1; depth >= 0; depth -= 1) {
    const column = columns[depth];
    if (!column?.length) {
      continue;
    }

    const wanted = column.map((node) => {
      const nodeHeight = heights.get(node.key) ?? 0;
      const bands = (outgoingOf.get(node.key) ?? [])
        .map((index) => {
          const link = flow.links[index];
          const childY = placed.get(flow.nodes[link.target]?.key ?? "");
          if (childY === undefined) {
            return null;
          }
          const start = childY + (bandStart.get(index) ?? 0);
          return { start, end: start + link.value * ratio };
        })
        .filter((band) => band !== null);

      if (bands.length === 0) {
        return base.get(node.key) ?? 0;
      }

      const top = Math.min(...bands.map((band) => band.start));
      const bottom = Math.max(...bands.map((band) => band.end));
      return (top + bottom) / 2 - nodeHeight / 2;
    });

    // L'ordre de la colonne ne bouge pas : on ne fait qu'écarter ce qui se
    // chevauche, vers le bas puis, si ça déborde, vers le haut.
    let cursor = 0;
    for (const [index, node] of column.entries()) {
      wanted[index] = Math.max(wanted[index], cursor);
      cursor = wanted[index] + (heights.get(node.key) ?? 0) + NODE_PADDING;
    }
    let floor = plotHeight;
    for (let index = column.length - 1; index >= 0; index -= 1) {
      const nodeHeight = heights.get(column[index].key) ?? 0;
      wanted[index] = Math.min(wanted[index], floor - nodeHeight);
      floor = wanted[index] - NODE_PADDING;
    }

    column.forEach((node, index) => placed.set(node.key, wanted[index]));
  }

  const shifts = new Map<string, number>();
  for (const node of flow.nodes) {
    shifts.set(
      node.key,
      (placed.get(node.key) ?? 0) - (base.get(node.key) ?? 0),
    );
  }
  return shifts;
}

/** Barre du nœud plus son libellé, avec halo pour rester lisible sur les liens. */
function FlowNodeShape({
  x,
  y,
  width,
  height,
  payload,
  locale,
  maxDepth,
  chartWidth,
  shifts,
}: NodeShapeProps) {
  const isLast = payload.depth === maxDepth;
  // Largeur d'un couloir intermédiaire : l'écart entre deux colonnes, moins la
  // barre du nœud suivant. La dernière colonne écrit dans la marge de droite.
  const columnWidth =
    maxDepth > 0
      ? (chartWidth - MARGIN.left - MARGIN.right - NODE_WIDTH) / maxDepth
      : 0;
  const lane = isLast ? MARGIN.right : columnWidth - NODE_WIDTH;
  const top = y + (shifts.get(payload.key) ?? 0);

  return (
    <g>
      <rect
        x={x}
        y={top}
        width={width}
        height={Math.max(height, 1)}
        rx={2}
        fill={payload.color}
      />
      {/*
        Le libellé passe par un foreignObject : la pastille opaque le détache
        des rubans qu'il survole, et la troncature CSS tombe exactement à la
        largeur du couloir, sans estimer la largeur du texte.
      */}
      <foreignObject
        x={x + width + LABEL_GAP}
        y={top + height / 2 - LABEL_HEIGHT / 2}
        width={Math.max(0, lane - LABEL_GAP * 2)}
        height={LABEL_HEIGHT}
      >
        <div className="flex h-full w-fit max-w-full items-center gap-1.5 rounded bg-background/95 px-1 text-[11px] leading-none">
          <span className="min-w-0 truncate font-medium text-foreground">
            {payload.name}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatCurrency(payload.value, locale)}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

interface LinkShapeProps {
  sourceX: number;
  targetX: number;
  sourceY: number;
  targetY: number;
  sourceControlX: number;
  targetControlX: number;
  linkWidth: number;
  payload: {
    color?: string;
    source?: { key?: string };
    target?: { key?: string };
  };
  shifts: Map<string, number>;
}

function FlowLinkShape({
  sourceX,
  targetX,
  sourceY,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
  shifts,
}: LinkShapeProps) {
  // Chaque bout suit le décalage de son propre nœud.
  const from = sourceY + (shifts.get(payload.source?.key ?? "") ?? 0);
  const to = targetY + (shifts.get(payload.target?.key ?? "") ?? 0);

  return (
    <path
      d={`M${sourceX},${from}C${sourceControlX},${from} ${targetControlX},${to} ${targetX},${to}`}
      fill="none"
      stroke={payload.color ?? "var(--muted-foreground)"}
      strokeWidth={Math.max(linkWidth, 1)}
      strokeOpacity={0.28}
    />
  );
}

export default function SpendingFlowGraph({
  flow,
  locale,
  width,
  height,
}: SpendingFlowGraphProps) {
  const maxDepth = flow.nodes.reduce(
    (deepest, node) => Math.max(deepest, node.depth),
    0,
  );
  const shifts = verticalShifts(flow, height - MARGIN.top - MARGIN.bottom);

  return (
    <Sankey
      width={width}
      height={height}
      data={{ nodes: flow.nodes, links: flow.links }}
      nodeWidth={NODE_WIDTH}
      nodePadding={NODE_PADDING}
      // Tout ce qui ne se subdivise pas file jusqu'au bord droit.
      align="justify"
      // Sans ces deux réglages, recharts replace chaque nœud à la moyenne de
      // ses liens et entrelace les colonnes : un poste passait alors par-dessus
      // trois rubans pour rejoindre sa place. L'ordre vient du flux lui-même.
      verticalAlign="top"
      sort={false}
      margin={MARGIN}
      node={
        // @ts-expect-error — recharts injecte x/y/width/height/payload.
        <FlowNodeShape
          locale={locale}
          maxDepth={maxDepth}
          chartWidth={width}
          shifts={shifts}
        />
      }
      link={
        // @ts-expect-error — recharts injecte la géométrie du lien.
        <FlowLinkShape shifts={shifts} />
      }
    >
      <Tooltip
        content={({ active, payload }) => {
          if (!active || !payload?.length) {
            return null;
          }

          // Le Sankey passe soit un nœud, soit un lien (avec ses deux bouts).
          const item = payload[0]?.payload as TooltipDatum | undefined;
          const data = item?.payload ?? item;
          const value =
            typeof data?.value === "number"
              ? data.value
              : typeof payload[0]?.value === "number"
                ? (payload[0].value as number)
                : null;
          if (value === null) {
            return null;
          }

          const label =
            data?.source?.name && data?.target?.name
              ? `${data.source.name} → ${data.target.name}`
              : data?.name;
          if (!label) {
            return null;
          }

          const items = data?.items ?? [];

          return (
            <div className="max-w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
              <p className="font-medium text-popover-foreground">{label}</p>
              <p className="tabular-nums text-muted-foreground">
                {formatCurrency(value, locale)}
              </p>
              {items.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
                  {items.map((line) => (
                    <li
                      key={line.key}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate text-popover-foreground">
                        {line.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatCurrency(line.amount, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        }}
      />
  </Sankey>
  );
}
