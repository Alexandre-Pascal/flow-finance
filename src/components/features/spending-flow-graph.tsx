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

import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";
import type { SpendingFlow, SpendingFlowNode } from "@/lib/finance/spending-flow";

export interface SpendingFlowGraphProps {
  flow: SpendingFlow;
  locale: string;
  /** Hauteur calculée par le panneau selon le nombre de postes. */
  height: number;
}

interface NodeShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SpendingFlowNode & { depth: number };
  containerWidth: number;
  locale: string;
  maxDepth: number;
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
}: NodeShapeProps) {
  const isLast = payload.depth === maxDepth;
  const labelX = isLast ? x - 8 : x + width + 8;
  const labelY = y + height / 2;

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
      <text
        x={labelX}
        y={labelY}
        textAnchor={isLast ? "end" : "start"}
        dominantBaseline="middle"
        className="fill-foreground text-[11px] font-medium"
        stroke="var(--background)"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {payload.name}
        <tspan className="fill-muted-foreground" dx={6}>
          {formatCurrency(payload.value, locale)}
        </tspan>
      </text>
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
  height,
}: SpendingFlowGraphProps) {
  const maxDepth = flow.nodes.reduce(
    (deepest, node) => Math.max(deepest, node.depth),
    0,
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey
        data={{ nodes: flow.nodes, links: flow.links }}
        nodeWidth={10}
        nodePadding={22}
        // « justify » collait les postes sans détail dans la dernière colonne,
        // à côté des lignes d'abonnement : une colonne = un niveau, désormais.
        align="left"
        // De la marge à droite pour les libellés de la dernière colonne.
        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        node={
          // @ts-expect-error — recharts injecte x/y/width/height/payload.
          <FlowNodeShape locale={locale} maxDepth={maxDepth} />
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
            const item = payload[0]?.payload as
              | {
                  name?: string;
                  value?: number;
                  source?: { name?: string };
                  target?: { name?: string };
                  payload?: {
                    name?: string;
                    value?: number;
                    source?: { name?: string };
                    target?: { name?: string };
                  };
                }
              | undefined;
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

            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
                <p className="font-medium text-popover-foreground">{label}</p>
                <p className="tabular-nums text-muted-foreground">
                  {formatCurrency(value, locale)}
                </p>
              </div>
            );
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}
