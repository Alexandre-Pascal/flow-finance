/**
 * @file spending-flow.ts
 * @description Met en forme, pour un diagramme de Sankey, ce que les autres
 * modules calculent déjà : entrées (salaire, rentrées suivies), budget,
 * catégories de dépenses, épargne versée, et le reste. Aucune règle métier
 * nouvelle ici — uniquement l'assemblage en nœuds et liens.
 */

/** Poste du flux : une entrée, une catégorie ou une ligne de détail. */
export interface FlowEntry {
  key: string;
  name: string;
  color: string;
  amount: number;
}

export const BUDGET_KEY = "__budget__";
export const REST_KEY = "__rest__";
export const SAVINGS_KEY = "__savings__";

export const BUDGET_COLOR = "#CA8A04";
export const REST_COLOR = "#94A3B8";
export const SAVINGS_COLOR = "#0F766E";

export interface SpendingFlowNode {
  key: string;
  name: string;
  color: string;
  value: number;
  /** 0 entrées · 1 budget · 2 postes · 3 détail d'un poste. */
  depth: 0 | 1 | 2 | 3;
}

export interface SpendingFlowLink {
  /** Index dans `nodes` (format attendu par le Sankey de recharts). */
  source: number;
  target: number;
  value: number;
  color: string;
}

export interface SpendingFlow {
  nodes: SpendingFlowNode[];
  links: SpendingFlowLink[];
  income: number;
  /** Somme des postes (dépenses + épargne). */
  allocated: number;
  /** Ce qui n'est ni dépensé ni mis de côté. */
  rest: number;
  hasData: boolean;
}

export interface SpendingFlowLabels {
  budget: string;
  rest: string;
  other: string;
}

export interface SpendingFlowInput {
  /** Salaire, rentrées suivies, autres crédits. */
  incomes: FlowEntry[];
  /** Catégories de dépenses, plus l'épargne si elle est suivie. */
  categories: FlowEntry[];
  /** Détail par catégorie : abonnements par service, épargne par enveloppe… */
  details?: Record<string, FlowEntry[]>;
  labels: SpendingFlowLabels;
  /** Lignes de détail affichées par catégorie avant regroupement. */
  maxChildren?: number;
}

/** En dessous, un poste ne vaut pas un nœud (arrondis de centimes). */
const MIN_VALUE = 0.01;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(entries: FlowEntry[]): number {
  return round(entries.reduce((total, entry) => total + entry.amount, 0));
}

function keep(entries: FlowEntry[]): FlowEntry[] {
  return entries
    .filter((entry) => entry.amount > MIN_VALUE)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Ramène les lignes de détail dans l'enveloppe de leur catégorie : on garde les
 * plus grosses, on tronque au total du parent, et le solde devient « Autres ».
 */
function fitChildren(
  children: FlowEntry[],
  parent: FlowEntry,
  maxChildren: number,
  otherLabel: string,
): FlowEntry[] {
  const fitted: FlowEntry[] = [];
  let used = 0;

  for (const child of keep(children).slice(0, maxChildren)) {
    const amount = round(Math.min(child.amount, parent.amount - used));
    if (amount <= MIN_VALUE) {
      break;
    }
    fitted.push({ ...child, amount });
    used = round(used + amount);
  }

  if (fitted.length === 0) {
    return [];
  }

  const left = round(parent.amount - used);
  if (left > MIN_VALUE) {
    fitted.push({
      key: `${parent.key}::other`,
      name: otherLabel,
      color: parent.color,
      amount: left,
    });
  }

  return fitted;
}

export function buildSpendingFlow({
  incomes,
  categories,
  details = {},
  labels,
  maxChildren = 6,
}: SpendingFlowInput): SpendingFlow {
  const sources = keep(incomes);
  const postes = keep(categories);
  const income = sum(sources);
  const allocated = sum(postes);
  const rest = round(income - allocated);

  const nodes: SpendingFlowNode[] = [];
  const links: SpendingFlowLink[] = [];
  const indexOf = new Map<string, number>();

  function addNode(node: SpendingFlowNode): number {
    const index = nodes.length;
    nodes.push(node);
    indexOf.set(node.key, index);
    return index;
  }

  for (const source of sources) {
    addNode({ ...source, value: source.amount, depth: 0 });
  }

  // Le budget vaut ce qui entre : c'est lui qui se redistribue ensuite.
  const budgetIndex = addNode({
    key: BUDGET_KEY,
    name: labels.budget,
    color: BUDGET_COLOR,
    value: Math.max(income, allocated),
    depth: 1,
  });

  for (const source of sources) {
    links.push({
      source: indexOf.get(source.key) as number,
      target: budgetIndex,
      value: source.amount,
      color: source.color,
    });
  }

  const outgoing = [...postes];
  if (rest > MIN_VALUE) {
    outgoing.push({
      key: REST_KEY,
      name: labels.rest,
      color: REST_COLOR,
      amount: rest,
    });
  }

  for (const poste of outgoing) {
    const posteIndex = addNode({
      ...poste,
      value: poste.amount,
      depth: 2,
    });
    links.push({
      source: budgetIndex,
      target: posteIndex,
      value: poste.amount,
      color: poste.color,
    });

    for (const child of fitChildren(
      details[poste.key] ?? [],
      poste,
      maxChildren,
      labels.other,
    )) {
      const childIndex = addNode({ ...child, value: child.amount, depth: 3 });
      links.push({
        source: posteIndex,
        target: childIndex,
        value: child.amount,
        color: child.color,
      });
    }
  }

  return {
    nodes,
    links,
    income,
    allocated,
    rest: Math.max(0, rest),
    hasData: sources.length > 0 && postes.length > 0,
  };
}
