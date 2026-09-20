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
}: NodeShapeProps) {
  const isLast = payload.depth === maxDepth;
  // Largeur d'un couloir intermédiaire : l'écart entre deux colonnes, moins la
  // barre du nœud suivant. La dernière colonne écrit dans la marge de droite.
  const columnWidth =
    maxDepth > 0
      ? (chartWidth - MARGIN.left - MARGIN.right - NODE_WIDTH) / maxDepth
      : 0;
  const lane = isLast ? MARGIN.right : columnWidth - NODE_WIDTH;

  return (
    <g>
      <rect
        x={x}
        y={y}
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
        y={y + height / 2 - LABEL_HEIGHT / 2}
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
  payload: { color?: string };
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
}: LinkShapeProps) {
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
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

  return (
    <Sankey
      width={width}
      height={height}
      data={{ nodes: flow.nodes, links: flow.links }}
      nodeWidth={NODE_WIDTH}
      nodePadding={30}
      // Tout ce qui ne se subdivise pas file jusqu'au bord droit.
      align="justify"
      margin={MARGIN}
      node={
        // @ts-expect-error — recharts injecte x/y/width/height/payload.
        <FlowNodeShape
          locale={locale}
          maxDepth={maxDepth}
          chartWidth={width}
        />
      }
      link={
        // @ts-expect-error — recharts injecte la géométrie du lien.
        <FlowLinkShape />
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
